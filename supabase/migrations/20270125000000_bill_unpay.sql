-- «↩️ មិនទាន់បង់»: undo a bill marked paid by mistake.
-- mark_bill_paid now remembers what it changed (the paid-up date before, the expense it
-- recorded, the due date it closed) so the undo puts the bill back exactly and removes only
-- that payment's expense. Payments without that memory (made before this, or from the bot)
-- are undone by one period; their expense, if any, is left for the user (we can't be sure which).

alter table public.recurring_bills add column if not exists last_payment jsonb;

create or replace function public.mark_bill_paid(p_bill_id uuid, p_wallet_id uuid default null, p_amount numeric default null, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.recurring_bills;
  due date;
  w public.wallets_accounts;
  rate numeric;
  tx_id uuid;
begin
  select * into b from public.recurring_bills where id = p_bill_id for update;
  if b.id is null or not public.can_write_workspace(b.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  due := public.bill_next_due(b);
  if p_wallet_id is not null then
    perform public.require_wallet_writer(p_wallet_id);
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = b.workspace_id;
    if w.id is null then
      raise exception 'invalid wallet' using errcode = '22023';
    end if;
    select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = b.workspace_id;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, exchange_rate, created_by)
    values (b.workspace_id, w.id, b.category_id, coalesce(p_amount, b.amount), b.currency, 'EXPENSE',
            coalesce(p_date::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours', now()), left(b.title, 500),
            case when w.currency <> b.currency then rate end, (select auth.uid()))
    returning id into tx_id;
  end if;
  update public.recurring_bills
     set paid_until = due,
         last_payment = jsonb_build_object('due', due, 'prev', b.paid_until, 'tx', tx_id, 'at', now())
   where id = b.id;
  return jsonb_build_object('paid_due', due, 'next_due', public.bill_next_due((select r from public.recurring_bills r where r.id = b.id)), 'transaction_id', tx_id);
end;
$$;
revoke all on function public.mark_bill_paid(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.mark_bill_paid(uuid, uuid, numeric, date) to authenticated;

create or replace function public.unmark_bill_paid(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.recurring_bills;
  lp jsonb;
  prev date;
  tx uuid;
  removed boolean := false;
  exact boolean;
begin
  select * into b from public.recurring_bills where id = p_bill_id for update;
  if b.id is null or not public.can_write_workspace(b.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if b.paid_until is null then
    return jsonb_build_object('status', 'not_paid');
  end if;
  lp := b.last_payment;
  exact := lp is not null and lp ->> 'due' = b.paid_until::text;
  if exact then
    prev := nullif(lp ->> 'prev', '')::date;
    tx := nullif(lp ->> 'tx', '')::uuid;
    -- That payment's own expense, if it is still there and unchanged in kind.
    if tx is not null then
      delete from public.transactions where id = tx and workspace_id = b.workspace_id and type = 'EXPENSE';
      removed := found;
    end if;
  else
    prev := (b.paid_until - case when b.frequency = 'YEARLY' then interval '1 year' else interval '1 month' end)::date;
  end if;
  update public.recurring_bills set paid_until = prev, last_payment = null where id = b.id;
  -- The paper bills of that period are unpaid again.
  update public.bill_statements set status = 'PENDING'
   where bill_id = b.id and status = 'PAID' and due_date is not null and (prev is null or due_date > prev + 15);
  return jsonb_build_object('status', 'ok', 'paid_until', prev, 'expense_removed', removed, 'expense_kept', not exact);
end;
$$;
revoke all on function public.unmark_bill_paid(uuid) from public, anon;
grant execute on function public.unmark_bill_paid(uuid) to authenticated;

select public.apply_security_gate();
