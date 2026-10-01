-- Phase 6: wallet reconciliation ("set the real balance").
-- Creates one adjustment ledger row for the difference between the recorded
-- and the actual balance, so the balance stays backed by transactions. The
-- wallet row is locked so a concurrent entry can't skew the difference.
-- Keep the preset names in sync with src/lib/categories/presets.ts.

create or replace function public.reconcile_wallet(p_wallet_id uuid, p_actual numeric, p_note text)
returns public.transactions
language plpgsql
set search_path = ''
as $$
declare
  w public.wallets_accounts;
  diff numeric;
  category_id uuid;
  result public.transactions;
begin
  select * into w from public.wallets_accounts where id = p_wallet_id for update;
  if not found then
    raise exception 'wallet not found' using errcode = 'P0002';
  end if;
  if p_actual is null then
    raise exception 'actual balance is required' using errcode = '22023';
  end if;

  diff := round(p_actual - w.balance, case when w.currency = 'KHR' then 0 else 2 end);
  if diff = 0 then
    return null;
  end if;

  if diff > 0 then
    category_id := public.ensure_preset_category(w.workspace_id, 'adjustment_in', 'INCOME', 'scale', '#64748b', 'កែតម្រូវសមតុល្យ (+)');
  else
    category_id := public.ensure_preset_category(w.workspace_id, 'adjustment_out', 'EXPENSE', 'scale', '#64748b', 'កែតម្រូវសមតុល្យ (−)');
  end if;

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date)
  values (
    w.workspace_id, w.id, category_id, abs(diff), w.currency,
    case when diff > 0 then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
    p_note, now()
  )
  returning * into result;
  return result;
end;
$$;
revoke all on function public.reconcile_wallet(uuid, numeric, text) from public, anon;
grant execute on function public.reconcile_wallet(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Loans saved from the calculator: the debt total is principal + interest,
-- but only the principal is received. disburse_debt() therefore takes an
-- optional amount (default: the full total, as before; must not exceed it).
-- ---------------------------------------------------------------------------
drop function public.disburse_debt(uuid, uuid, numeric, timestamptz);

create or replace function public.disburse_debt(
  p_debt_id uuid,
  p_wallet_id uuid,
  p_exchange_rate numeric,
  p_date timestamptz,
  p_amount numeric default null
)
returns public.transactions
language plpgsql
set search_path = ''
as $$
declare
  d public.debts;
  w public.wallets_accounts;
  category_id uuid;
  moved numeric;
  result public.transactions;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then
    raise exception 'debt not found' using errcode = 'P0002';
  end if;
  if d.disbursement_transaction_id is not null then
    raise exception 'debt already disbursed' using errcode = '22023';
  end if;
  select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
  if not found then
    raise exception 'wallet not found in this workspace' using errcode = 'P0002';
  end if;
  moved := coalesce(p_amount, d.total_amount);
  if moved <= 0 or moved > d.total_amount then
    raise exception 'disbursement amount must be between 0 and the debt total' using errcode = '22023';
  end if;

  if d.type = 'PAYABLE' then
    category_id := public.ensure_preset_category(d.workspace_id, 'loan_received', 'INCOME', 'landmark', '#6366f1', 'ប្រាក់ខ្ចីបានទទួល');
  else
    category_id := public.ensure_preset_category(d.workspace_id, 'loan_given', 'EXPENSE', 'hand-coins', '#f59e0b', 'ឱ្យគេខ្ចី');
  end if;

  insert into public.transactions (
    workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id
  ) values (
    d.workspace_id, w.id, category_id, moved, d.currency,
    case when d.type = 'PAYABLE' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
    case when w.currency = d.currency then null else p_exchange_rate end,
    d.party_name, coalesce(p_date, now()), d.id
  ) returning * into result;

  update public.debts set disbursement_transaction_id = result.id where id = d.id;
  return result;
end;
$$;
revoke all on function public.disburse_debt(uuid, uuid, numeric, timestamptz, numeric) from public, anon;
grant execute on function public.disburse_debt(uuid, uuid, numeric, timestamptz, numeric) to authenticated;
