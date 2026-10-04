-- Debts, part 2:
--   * Record-only repayments: a past repayment entered for the history only —
--     it lowers what is left, with its date, note and slip photo, but moves no
--     money (no wallet, no transaction), like a record-only borrowing.
--   * Slip photos on repayments.
--   * Borrowing tranches ("ខ្ចីបន្ថែម"): more money borrowed / lent on the same
--     debt later, with a date, note, slip and an optional wallet movement; the
--     debt total grows by it. Together they make the debt's timeline.

-- ---------------------------------------------------------------------------
-- Repayments: wallet and transaction become optional (record-only), plus a slip.
-- ---------------------------------------------------------------------------
alter table public.debt_repayments alter column wallet_id drop not null;
alter table public.debt_repayments alter column transaction_id drop not null;
alter table public.debt_repayments add column if not exists attachment_path text check (attachment_path is null or char_length(attachment_path) <= 200);
alter table public.debt_repayments drop constraint if exists debt_repayments_record_only_check;
alter table public.debt_repayments add constraint debt_repayments_record_only_check
  check ((wallet_id is null) = (transaction_id is null));

-- A wallet repayment must match its transaction; a record-only one has neither.
-- A slip must be the caller's own upload (the storage policy below shows it to
-- the workspace, so a foreign path would leak someone else's file).
create or replace function public.guard_debt_repayment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attachment_path is not null and new.attachment_path not like (select auth.uid())::text || '/%' then
    raise exception 'invalid attachment' using errcode = '22023';
  end if;
  if new.transaction_id is null and new.wallet_id is null then
    if new.amount_paid is null or new.amount_paid <= 0
       or new.amount_paid > (select d.total_amount - d.paid_amount from public.debts d where d.id = new.debt_id) then
      raise exception 'amount exceeds the remaining balance' using errcode = '22023';
    end if;
    return new;
  end if;
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

-- Access: a member of the debt's workspace (writers to change); the wallet, when there is one, must be in it.
create or replace function public.debt_repayment_access(p_debt_id uuid, p_wallet_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.debts d
    join public.workspace_members m on m.workspace_id = d.workspace_id
    where d.id = p_debt_id
      and m.user_id = (select auth.uid())
      and (not p_write or m.role in ('OWNER', 'MEMBER'))
      and (p_wallet_id is null or exists (select 1 from public.wallets_accounts w where w.id = p_wallet_id and w.workspace_id = d.workspace_id))
  );
$$;

-- Record a repayment. With a wallet: as before (a transaction moves the money).
-- Without (p_wallet_id null): record-only. An optional slip photo path.
drop function if exists public.record_debt_repayment(uuid, uuid, numeric, numeric, timestamptz, text);
create or replace function public.record_debt_repayment(
  p_debt_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_exchange_rate numeric,
  p_payment_date timestamptz,
  p_note text,
  p_attachment text default null
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_amount > d.total_amount - d.paid_amount then
    raise exception 'amount exceeds the remaining balance' using errcode = '22023';
  end if;
  if p_attachment is not null and p_attachment not like (select auth.uid())::text || '/%' then
    raise exception 'invalid attachment' using errcode = '22023';
  end if;

  if p_wallet_id is not null then
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
    if not found then
      raise exception 'wallet not found in this workspace' using errcode = 'P0002';
    end if;
    if d.type = 'PAYABLE' then
      category_id := public.ensure_preset_category(d.workspace_id, 'debt_repayment', 'EXPENSE', 'hand-coins', '#64748b', 'សងបំណុល');
    else
      category_id := public.ensure_preset_category(d.workspace_id, 'debt_collection', 'INCOME', 'hand-coins', '#0ea5e9', 'ទទួលប្រាក់សងបំណុល');
    end if;
    insert into public.transactions (
      workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id, receipt_url
    ) values (
      d.workspace_id, w.id, category_id, p_amount, d.currency,
      case when d.type = 'PAYABLE' then 'EXPENSE'::public.transaction_type else 'INCOME'::public.transaction_type end,
      case when w.currency = d.currency then null else p_exchange_rate end,
      coalesce(p_note, d.party_name), coalesce(p_payment_date, now()), d.id, p_attachment
    ) returning id into tx_id;
  end if;

  insert into public.debt_repayments (debt_id, wallet_id, amount_paid, payment_date, note, transaction_id, attachment_path)
  values (d.id, w.id, p_amount, coalesce(p_payment_date, now()), p_note, tx_id, p_attachment)
  returning * into result;
  return result;
end;
$$;
revoke all on function public.record_debt_repayment(uuid, uuid, numeric, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.record_debt_repayment(uuid, uuid, numeric, numeric, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Borrowing tranches
-- ---------------------------------------------------------------------------
create table if not exists public.debt_tranches (
  id              uuid primary key default gen_random_uuid(),
  debt_id         uuid not null references public.debts (id) on delete cascade,
  amount          numeric(18, 2) not null check (amount > 0),
  tranche_date    timestamptz not null default now(),
  note            text check (note is null or char_length(note) <= 500),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 200),
  wallet_id       uuid references public.wallets_accounts (id) on delete set null,
  transaction_id  uuid unique references public.transactions (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists debt_tranches_debt_idx on public.debt_tranches (debt_id, tranche_date);
alter table public.debt_tranches enable row level security;
drop policy if exists debt_tranches_select on public.debt_tranches;
create policy debt_tranches_select on public.debt_tranches for select to authenticated using (public.debt_repayment_access(debt_id, null, false));
revoke insert, update, delete on public.debt_tranches from anon, authenticated;
grant select on public.debt_tranches to authenticated;

-- Add a tranche: the total grows by it; with a wallet the money moves (like the first disbursement).
create or replace function public.add_debt_tranche(
  p_debt_id uuid, p_amount numeric, p_date timestamptz, p_note text,
  p_wallet_id uuid default null, p_exchange_rate numeric default null, p_attachment text default null
)
returns public.debt_tranches
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.debts;
  w public.wallets_accounts;
  category_id uuid;
  tx_id uuid;
  result public.debt_tranches;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if d.id is null or not public.debt_repayment_access(d.id, p_wallet_id, true) or not public.can_write_workspace(d.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.schedule_principal is not null then
    raise exception 'installment debts are changed by editing the schedule' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1e12 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_attachment is not null and p_attachment not like (select auth.uid())::text || '/%' then
    raise exception 'invalid attachment' using errcode = '22023';
  end if;

  update public.debts set total_amount = total_amount + p_amount where id = d.id;

  if p_wallet_id is not null then
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
    if d.type = 'PAYABLE' then
      category_id := public.ensure_preset_category(d.workspace_id, 'loan_received', 'INCOME', 'landmark', '#6366f1', 'ប្រាក់ខ្ចីបានទទួល');
    else
      category_id := public.ensure_preset_category(d.workspace_id, 'loan_given', 'EXPENSE', 'hand-coins', '#f59e0b', 'ឱ្យគេខ្ចី');
    end if;
    insert into public.transactions (
      workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id, receipt_url, created_by
    ) values (
      d.workspace_id, w.id, category_id, p_amount, d.currency,
      case when d.type = 'PAYABLE' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
      case when w.currency = d.currency then null else p_exchange_rate end,
      coalesce(p_note, d.party_name), coalesce(p_date, now()), d.id, p_attachment, (select auth.uid())
    ) returning id into tx_id;
  end if;

  insert into public.debt_tranches (debt_id, amount, tranche_date, note, attachment_path, wallet_id, transaction_id)
  values (d.id, p_amount, coalesce(p_date, now()), left(nullif(btrim(coalesce(p_note, '')), ''), 500), p_attachment, w.id, tx_id)
  returning * into result;
  return result;
end;
$$;
revoke all on function public.add_debt_tranche(uuid, numeric, timestamptz, text, uuid, numeric, text) from public, anon;
grant execute on function public.add_debt_tranche(uuid, numeric, timestamptz, text, uuid, numeric, text) to authenticated;

-- Remove a tranche: the total shrinks (never below what was repaid) and its wallet movement is undone.
create or replace function public.delete_debt_tranche(p_tranche_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.debt_tranches;
  d public.debts;
begin
  select * into t from public.debt_tranches where id = p_tranche_id;
  if t.id is null then
    return;
  end if;
  select * into d from public.debts where id = t.debt_id for update;
  if not public.debt_repayment_access(d.id, null, true) or not public.can_write_workspace(d.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.total_amount - t.amount < d.paid_amount then
    raise exception 'amount exceeds the remaining balance' using errcode = '22023';
  end if;
  delete from public.debt_tranches where id = t.id;
  if t.transaction_id is not null then
    delete from public.transactions where id = t.transaction_id;
  end if;
  update public.debts set total_amount = total_amount - t.amount where id = d.id;
end;
$$;
revoke all on function public.delete_debt_tranche(uuid) from public, anon;
grant execute on function public.delete_debt_tranche(uuid) to authenticated;

-- Slip photos of repayments and tranches are visible to the debt's workspace members.
drop policy if exists receipts_select_debt_history on storage.objects;
create policy receipts_select_debt_history on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      exists (select 1 from public.debt_repayments r join public.debts d on d.id = r.debt_id
              where r.attachment_path = objects.name and public.is_workspace_member(d.workspace_id))
      or exists (select 1 from public.debt_tranches x join public.debts d on d.id = x.debt_id
                 where x.attachment_path = objects.name and public.is_workspace_member(d.workspace_id))
    )
  );

select public.apply_security_gate();
