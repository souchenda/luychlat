-- Bank loans (កម្ចីបង់រំលស់ធនាគារ): an installment schedule with schedule_method
-- 'BANK'. Unlike FLAT / REDUCING, the debt holds the principal only
-- (total_amount = principal, paid_amount = principal repaid); interest and the
-- monthly fee (insurance) are expenses booked with each installment.
--
-- Schedule (mirrored in src/lib/loans/amortization.ts — keep both in step):
--   r = yearly rate / 12, EMI = P·r / (1 − (1+r)^−n), rounded to the currency.
--   #1: interest = P · yearly · days / 360 (days from start_date to the first due
--       date: the bank's broken first period); principal = EMI − P·r (exact).
--   #2…: interest = balance · r; principal = EMI − interest, so every regular
--       installment is the same (EMI + fee). The last one clears the balance.

alter table public.debts add column if not exists schedule_fee numeric(18, 2);
grant update (schedule_fee) on public.debts to authenticated;

alter table public.debts drop constraint if exists debts_schedule_check;
alter table public.debts add constraint debts_schedule_check check (
  (
    num_nulls(schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal) = 6
    and schedule_fee is null
  )
  or (
    num_nulls(schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal) = 0
    and schedule_frequency in ('MONTHLY', 'WEEKLY') and schedule_count between 1 and 600
    and schedule_method in ('FLAT', 'REDUCING', 'BANK') and schedule_payment > 0 and schedule_principal > 0
    and (schedule_method <> 'BANK' or (schedule_frequency = 'MONTHLY' and type = 'PAYABLE'))
    and (schedule_fee is null or (schedule_fee >= 0 and schedule_method = 'BANK'))
  )
);

-- PRO guard: the fee is part of the schedule.
create or replace function public.guard_debt_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or new.schedule_frequency is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (new.schedule_frequency, new.schedule_count, new.schedule_method, new.schedule_first_due, new.schedule_payment, new.schedule_principal, new.schedule_fee)
      is not distinct from (old.schedule_frequency, old.schedule_count, old.schedule_method, old.schedule_first_due, old.schedule_payment, old.schedule_principal, old.schedule_fee) then
    return new;
  end if;
  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists debts_guard_schedule on public.debts;
create trigger debts_guard_schedule
  before insert or update of schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal, schedule_fee
  on public.debts
  for each row execute function public.guard_debt_schedule();

-- Same rounding as the app's roundMoney (half up; whole riel / cents).
create or replace function public.loan_round(x double precision, khr boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when khr then floor(x + 0.5)::numeric else floor(x * 100 + 0.5)::numeric / 100 end
$$;

-- Every installment of a bank loan (empty for other debts).
create or replace function public.bank_loan_rows(d public.debts)
returns table (n integer, due date, principal numeric, interest numeric, fee numeric, balance numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  khr boolean := d.currency = 'KHR';
  yearly double precision;
  r double precision;
  p double precision;
  emi_exact double precision;
  emi numeric;
  bal numeric;
  days integer;
  i integer;
begin
  if d.schedule_method is distinct from 'BANK' or d.schedule_count is null or d.schedule_principal is null then
    return;
  end if;
  yearly := case when d.interest_period = 'MONTH' then (d.interest_rate::double precision / 100) * 12 else d.interest_rate::double precision / 100 end;
  r := yearly / 12;
  p := d.schedule_principal::double precision;
  emi_exact := case when r = 0 then p / d.schedule_count else (p * r) / (1 - power(1 + r, -d.schedule_count)) end;
  emi := public.loan_round(emi_exact, khr);
  days := d.schedule_first_due - d.start_date;
  bal := d.schedule_principal;
  fee := coalesce(d.schedule_fee, 0);

  for i in 1..d.schedule_count loop
    n := i;
    due := (d.schedule_first_due + make_interval(months => i - 1))::date;
    if i = 1 then
      interest := case when days > 0 then public.loan_round(p * yearly * days / 360, khr) else public.loan_round(p * r, khr) end;
      principal := public.loan_round(emi_exact - p * r, khr);
    else
      interest := public.loan_round(bal::double precision * r, khr);
      principal := emi - interest;
    end if;
    if i = d.schedule_count or principal > bal then
      principal := bal;
    end if;
    if principal < 0 then
      principal := 0;
    end if;
    bal := bal - principal;
    balance := bal;
    return next;
  end loop;
end;
$$;

-- Installments paid with the 1-tap action: the reference to the three ledger
-- rows (principal repayment, interest expense, fee expense).
create table if not exists public.debt_loan_installments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  n              smallint not null check (n between 1 and 600),
  principal      numeric(18, 2) not null default 0 check (principal >= 0),
  interest       numeric(18, 2) not null default 0 check (interest >= 0),
  fee            numeric(18, 2) not null default 0 check (fee >= 0),
  wallet_id      uuid references public.wallets_accounts (id) on delete set null,
  -- Deleting the principal repayment (from the debt history) un-pays the installment.
  repayment_id   uuid references public.debt_repayments (id) on delete cascade,
  interest_tx_id uuid references public.transactions (id) on delete set null,
  fee_tx_id      uuid references public.transactions (id) on delete set null,
  paid_at        timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  foreign key (debt_id, workspace_id) references public.debts (id, workspace_id) on delete cascade,
  unique (debt_id, n)
);
create index if not exists debt_loan_installments_ws_idx on public.debt_loan_installments (workspace_id);

alter table public.debt_loan_installments enable row level security;
revoke update on public.debt_loan_installments from anon, authenticated;
drop policy if exists debt_loan_installments_select on public.debt_loan_installments;
create policy debt_loan_installments_select on public.debt_loan_installments
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists debt_loan_installments_insert on public.debt_loan_installments;
create policy debt_loan_installments_insert on public.debt_loan_installments
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists debt_loan_installments_delete on public.debt_loan_installments;
create policy debt_loan_installments_delete on public.debt_loan_installments
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- The next unpaid installment. Bank loans: principal repaid covers installments
-- oldest first; the amount is what's left of its principal + interest + fee.
create or replace function public.debt_next_installment(d public.debts, out n integer, out due date, out amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  covered integer;
  step interval;
  rec record;
  cum numeric := 0;
begin
  if d.schedule_frequency is null or d.paid_amount >= d.total_amount then
    return;
  end if;
  if d.schedule_method = 'BANK' then
    for rec in select * from public.bank_loan_rows(d) loop
      cum := cum + rec.principal;
      if cum > d.paid_amount + 0.001 then
        n := rec.n;
        due := rec.due;
        amount := least(cum, d.total_amount) - d.paid_amount + rec.interest + rec.fee;
        return;
      end if;
    end loop;
    return;
  end if;
  step := case d.schedule_frequency when 'WEEKLY' then interval '7 days' else interval '1 month' end;
  covered := least(floor((d.paid_amount + 0.001) / d.schedule_payment)::integer, d.schedule_count - 1);
  n := covered + 1;
  due := (d.schedule_first_due + step * covered)::date;
  amount := case
    when n = d.schedule_count then d.total_amount - d.paid_amount
    else least(d.schedule_payment * n - d.paid_amount, d.total_amount - d.paid_amount)
  end;
end;
$$;

-- 1-tap: pay the next installment from a wallet. Lowers the loan by its
-- principal (a normal repayment), books the interest and the fee as expenses,
-- and records the installment. Runs as the caller (RLS applies throughout).
create or replace function public.pay_loan_installment(
  p_debt_id uuid,
  p_wallet_id uuid,
  p_exchange_rate numeric,
  p_payment_date timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  d public.debts;
  w public.wallets_accounts;
  rec record;
  cum numeric := 0;
  principal_due numeric;
  label text;
  rep public.debt_repayments;
  interest_cat uuid;
  fee_cat uuid;
  interest_tx uuid;
  fee_tx uuid;
  rate numeric;
  paid_ts timestamptz := coalesce(p_payment_date, now());
  row_id uuid;
  hit boolean := false;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then
    raise exception 'debt not found' using errcode = 'P0002';
  end if;
  if d.schedule_method is distinct from 'BANK' then
    raise exception 'not a bank loan' using errcode = '22023';
  end if;
  select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
  if not found then
    raise exception 'wallet not found in this workspace' using errcode = 'P0002';
  end if;
  rate := case when w.currency = d.currency then null else p_exchange_rate end;
  if w.currency <> d.currency and (rate is null or rate <= 0) then
    raise exception 'exchange rate required' using errcode = '22023';
  end if;

  for rec in select * from public.bank_loan_rows(d) loop
    cum := cum + rec.principal;
    if cum > d.paid_amount + 0.001 then
      hit := true;
      exit;
    end if;
  end loop;
  if not hit or d.paid_amount >= d.total_amount then
    raise exception 'loan_fully_paid' using errcode = '22023';
  end if;
  if exists (select 1 from public.debt_loan_installments i where i.debt_id = d.id and i.n = rec.n) then
    raise exception 'installment_already_paid' using errcode = '22023';
  end if;
  principal_due := least(cum, d.total_amount) - d.paid_amount;
  label := 'បង់រំលស់លើកទី ' || rec.n || '/' || d.schedule_count || ' · ' || d.party_name;

  if principal_due > 0 then
    rep := public.record_debt_repayment(d.id, w.id, principal_due, p_exchange_rate, paid_ts, label);
  end if;
  if rec.interest > 0 then
    interest_cat := public.ensure_preset_category(d.workspace_id, 'loan_interest', 'EXPENSE', 'landmark', '#ef4444', 'ការប្រាក់កម្ចី');
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id)
    values (d.workspace_id, w.id, interest_cat, rec.interest, d.currency, 'EXPENSE', rate, label, paid_ts, d.id)
    returning id into interest_tx;
  end if;
  if rec.fee > 0 then
    fee_cat := public.ensure_preset_category(d.workspace_id, 'loan_insurance', 'EXPENSE', 'receipt', '#8b5cf6', 'ធានារ៉ាប់រងកម្ចី');
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id)
    values (d.workspace_id, w.id, fee_cat, rec.fee, d.currency, 'EXPENSE', rate, label, paid_ts, d.id)
    returning id into fee_tx;
  end if;

  insert into public.debt_loan_installments (debt_id, workspace_id, n, principal, interest, fee, wallet_id, repayment_id, interest_tx_id, fee_tx_id, paid_at)
  values (d.id, d.workspace_id, rec.n, greatest(principal_due, 0), rec.interest, rec.fee, w.id, rep.id, interest_tx, fee_tx, paid_ts)
  returning id into row_id;

  return jsonb_build_object(
    'id', row_id, 'n', rec.n, 'count', d.schedule_count,
    'principal', greatest(principal_due, 0), 'interest', rec.interest, 'fee', rec.fee,
    'total', greatest(principal_due, 0) + rec.interest + rec.fee
  );
end;
$$;
revoke all on function public.pay_loan_installment(uuid, uuid, numeric, timestamptz) from public, anon;
grant execute on function public.pay_loan_installment(uuid, uuid, numeric, timestamptz) to authenticated;

-- Undo the latest 1-tap installment: removes its three ledger rows (wallet and
-- loan are restored by the usual triggers).
create or replace function public.undo_loan_installment(p_installment_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  i public.debt_loan_installments;
  rep_tx uuid;
begin
  select * into i from public.debt_loan_installments where id = p_installment_id;
  if not found then
    raise exception 'installment not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.debt_loan_installments x where x.debt_id = i.debt_id and x.n > i.n) then
    raise exception 'undo_latest_only' using errcode = '22023';
  end if;
  select transaction_id into rep_tx from public.debt_repayments where id = i.repayment_id;
  delete from public.debt_loan_installments where id = i.id;
  delete from public.transactions where id in (i.interest_tx_id, i.fee_tx_id);
  if rep_tx is not null then
    delete from public.transactions where id = rep_tx;
  elsif i.repayment_id is not null then
    delete from public.debt_repayments where id = i.repayment_id;
  end if;
end;
$$;
revoke all on function public.undo_loan_installment(uuid) from public, anon;
grant execute on function public.undo_loan_installment(uuid) to authenticated;

select public.apply_security_gate();
