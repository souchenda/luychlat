-- Phase 4: debt engine and repayments.
--
-- Money model: every repayment is ALSO a regular ledger transaction (EXPENSE
-- for a payable, INCOME for a receivable) linked through
-- debt_repayments.transaction_id and transactions.debt_id. Wallet balances are
-- therefore moved by the existing transactions_balance trigger, and repayments
-- appear in the ledger and cash flow. Repayments are recorded atomically with
-- public.record_debt_repayment(); deleting the transaction deletes the
-- repayment (cascade) and recomputes the debt.

do $$ begin create type public.interest_period as enum ('YEAR', 'MONTH'); exception when duplicate_object then null; end $$;

alter table public.debts
  add column if not exists note            text check (note is null or char_length(note) <= 500),
  add column if not exists interest_period public.interest_period not null default 'YEAR',
  add column if not exists start_date      date not null default current_date;

alter table public.transactions
  add column if not exists debt_id uuid,
  drop constraint if exists transactions_debt_id_workspace_id_fkey,
  add constraint transactions_debt_id_workspace_id_fkey
    foreign key (debt_id, workspace_id) references public.debts (id, workspace_id) on delete set null (debt_id);
create index if not exists transactions_debt_id_idx on public.transactions (debt_id);

alter table public.debt_repayments
  add column if not exists transaction_id uuid not null unique references public.transactions (id) on delete cascade;

-- Repayments are immutable (delete + re-record); amounts must stay in sync with
-- their transaction.
drop policy if exists debt_repayments_update on public.debt_repayments;

-- ---------------------------------------------------------------------------
-- Debt status / paid amount are always derived, never trusted from clients.
-- ---------------------------------------------------------------------------
create or replace function public.debt_status_for(p_total numeric, p_paid numeric, p_due date)
returns public.debt_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_paid >= p_total then 'SETTLED'::public.debt_status
    when p_due is not null and p_due < current_date then 'OVERDUE'::public.debt_status
    when p_paid > 0 then 'PARTIALLY_PAID'::public.debt_status
    else 'ACTIVE'::public.debt_status
  end;
$$;

create or replace function public.on_debt_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paid_amount := 0;
  else
    new.paid_amount := coalesce(
      (select sum(r.amount_paid) from public.debt_repayments r where r.debt_id = new.id), 0
    );
    if new.currency is distinct from old.currency and new.paid_amount > 0 then
      raise exception 'cannot change currency of a debt with repayments' using errcode = '22023';
    end if;
  end if;
  if new.total_amount < new.paid_amount then
    raise exception 'total_amount is below the amount already paid' using errcode = '22023';
  end if;
  new.status := public.debt_status_for(new.total_amount, new.paid_amount, new.due_date);
  return new;
end;
$$;

create or replace trigger debts_derive
  before insert or update on public.debts
  for each row execute function public.on_debt_write();

-- Repayment integrity: must point at a transaction of the same debt, wallet and amount.
create or replace function public.guard_debt_repayment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id
      and t.debt_id = new.debt_id
      and t.wallet_id = new.wallet_id
      and t.amount = new.amount_paid
  ) then
    raise exception 'repayment does not match its transaction' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace trigger debt_repayments_guard
  before insert on public.debt_repayments
  for each row execute function public.guard_debt_repayment();

-- Re-derive the debt after repayments change (touching the row fires debts_derive).
create or replace function public.on_debt_repayment_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.debts set paid_amount = paid_amount
  where id = coalesce(new.debt_id, old.debt_id);
  return null;
end;
$$;

create or replace trigger debt_repayments_rederive
  after insert or delete on public.debt_repayments
  for each row execute function public.on_debt_repayment_change();

-- Ledger rows created for a repayment may only change their note / date /
-- category. Unlinking (debt_id -> null, done by the FK when a debt is deleted)
-- is allowed; the money history stays.
create or replace function public.guard_debt_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.debt_id is not null and (
    (new.amount, new.currency, new.wallet_id, new.type, new.exchange_rate)
      is distinct from (old.amount, old.currency, old.wallet_id, old.type, old.exchange_rate)
    or (new.debt_id is not null and new.debt_id <> old.debt_id)
  ) then
    raise exception 'debt repayment transactions are edited from the debt' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace trigger transactions_debt_guard
  before update on public.transactions
  for each row execute function public.guard_debt_transaction();

-- ---------------------------------------------------------------------------
-- Repayment categories (presets), seeded for new workspaces and created on
-- demand for existing ones. Keep in sync with src/lib/categories/presets.ts.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_preset_category(
  p_workspace_id uuid, p_key text, p_type public.category_type, p_icon text, p_color text, p_name text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select id into found_id from public.categories
  where workspace_id = p_workspace_id and preset_key = p_key
  limit 1;
  if found_id is null then
    insert into public.categories (workspace_id, preset_key, type, icon, color, name)
    values (p_workspace_id, p_key, p_type, p_icon, p_color, p_name)
    returning id into found_id;
  end if;
  return found_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_debt_repayment: one atomic call for the ledger row + repayment row.
-- Runs as the caller, so RLS applies to every read and write.
-- `p_amount` is in the debt's currency; `p_exchange_rate` (KHR per 1 USD) is
-- required when the wallet uses the other currency.
-- ---------------------------------------------------------------------------
create or replace function public.record_debt_repayment(
  p_debt_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_exchange_rate numeric,
  p_payment_date timestamptz,
  p_note text
)
returns public.debt_repayments
language plpgsql
set search_path = ''
as $$
declare
  d public.debts;
  w public.wallets_accounts;
  category_id uuid;
  tx_id uuid;
  result public.debt_repayments;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then
    raise exception 'debt not found' using errcode = 'P0002';
  end if;
  select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
  if not found then
    raise exception 'wallet not found in this workspace' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_amount > d.total_amount - d.paid_amount then
    raise exception 'amount exceeds the remaining balance' using errcode = '22023';
  end if;

  if d.type = 'PAYABLE' then
    category_id := public.ensure_preset_category(d.workspace_id, 'debt_repayment', 'EXPENSE', 'hand-coins', '#64748b', 'សងបំណុល');
  else
    category_id := public.ensure_preset_category(d.workspace_id, 'debt_collection', 'INCOME', 'hand-coins', '#0ea5e9', 'ទទួលប្រាក់សងបំណុល');
  end if;

  insert into public.transactions (
    workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id
  ) values (
    d.workspace_id, w.id, category_id, p_amount, d.currency,
    case when d.type = 'PAYABLE' then 'EXPENSE'::public.transaction_type else 'INCOME'::public.transaction_type end,
    case when w.currency = d.currency then null else p_exchange_rate end,
    coalesce(p_note, d.party_name), coalesce(p_payment_date, now()), d.id
  ) returning id into tx_id;

  insert into public.debt_repayments (debt_id, wallet_id, amount_paid, payment_date, note, transaction_id)
  values (d.id, w.id, p_amount, coalesce(p_payment_date, now()), p_note, tx_id)
  returning * into result;

  return result;
end;
$$;
revoke all on function public.record_debt_repayment(uuid, uuid, numeric, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_debt_repayment(uuid, uuid, numeric, numeric, timestamptz, text) to authenticated;

create index if not exists debts_workspace_type_idx on public.debts (workspace_id, type, status);
