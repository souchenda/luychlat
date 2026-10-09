-- Undoing a payment (↩️ «មិនទាន់បង់», or deleting the entry that settled a bill) left a paper
-- statement with no due date (an EAC notice gives none) marked PAID: only dated statements were
-- reset. A payment now remembers exactly which statements it closed, and the undo reopens those.
-- (Found by a rolled-back test on House 35, 09/10.)

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
         last_payment = jsonb_build_object('due', due, 'prev', b.paid_until, 'tx', tx_id, 'at', now(),
           'statements', (select coalesce(jsonb_agg(s.id), '[]'::jsonb) from public.bill_statements s where s.bill_id = b.id and s.status = 'PENDING' and (s.due_date is null or s.due_date <= due + 15)))
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
  -- The paper bills that payment closed are unpaid again.
  if jsonb_typeof(lp -> 'statements') = 'array' then
    update public.bill_statements set status = 'PENDING'
     where bill_id = b.id and status = 'PAID' and id::text in (select jsonb_array_elements_text(lp -> 'statements'));
  else
    update public.bill_statements set status = 'PENDING'
     where bill_id = b.id and status = 'PAID' and due_date is not null and (prev is null or due_date > prev + 15);
  end if;
  return jsonb_build_object('status', 'ok', 'paid_until', prev, 'expense_removed', removed, 'expense_kept', not exact);
end;
$$;
revoke all on function public.unmark_bill_paid(uuid) from public, anon;
grant execute on function public.unmark_bill_paid(uuid) to authenticated;

create or replace function public.bot_bill_settle(p_key text, p_chat_id bigint, p_tx_id uuid, p_customer text, p_party text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  b public.recurring_bills;
  n integer;
  v_cust text := regexp_replace(coalesce(p_customer, ''), '\D', '', 'g');
  v_text text := lower(coalesce(p_party, '') || ' ' || coalesce(p_customer, ''));
  v_kind text;
  rate numeric;
  due date;
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then return jsonb_build_object('settled', false); end if;
  select * into t from public.transactions
  where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '1 day';
  if t.id is null then return jsonb_build_object('settled', false); end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(t.workspace_id) then return jsonb_build_object('settled', false); end if;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = t.workspace_id;

  -- 1. The customer number on the payment is the bill's own.
  if char_length(v_cust) >= 6 then
    select count(distinct x.id) into n from public.recurring_bills x
    join public.bill_statements s on s.bill_id = x.id
    where x.workspace_id = t.workspace_id and x.is_active and regexp_replace(coalesce(s.customer_id, ''), '\D', '', 'g') = v_cust;
    if n = 1 then
      select x.* into b from public.recurring_bills x
      join public.bill_statements s on s.bill_id = x.id
      where x.workspace_id = t.workspace_id and x.is_active and regexp_replace(coalesce(s.customer_id, ''), '\D', '', 'g') = v_cust
      limit 1;
    end if;
  end if;

  -- 2. Else the payee's kind, one bill of that kind, the amount and the timing agree.
  if b.id is null then
    v_kind := case
      when v_text ~ '(\medc\M|electric|électricité|អគ្គិសនី|ភ្លើង|kour ?srov|akisani)' then 'ELECTRICITY'
      when v_text ~ '(ppwsa|\mwater\M|ទឹកស្អាត|ផ្គត់ផ្គង់ទឹក|ទឹកប្រើប្រាស់)' then 'WATER'
      when v_text ~ '(internet|ezecom|opennet|sinet|fiber|fibre|wifi|អ៊ីនធឺណិត)' then 'INTERNET'
    end;
    if v_kind is null then return jsonb_build_object('settled', false); end if;
    select count(*) into n from public.recurring_bills x where x.workspace_id = t.workspace_id and x.is_active and x.kind = v_kind;
    if n <> 1 then return jsonb_build_object('settled', false); end if;
    select x.* into b from public.recurring_bills x where x.workspace_id = t.workspace_id and x.is_active and x.kind = v_kind;
    if abs(public.amount_in_wallet_currency(t.amount, t.currency, rate, b.currency) - b.amount) > b.amount * 0.15 then
      return jsonb_build_object('settled', false);
    end if;
  end if;

  due := public.bill_next_due(b);
  if due > today + 20 then return jsonb_build_object('settled', false, 'reason', 'not_due'); end if;
  update public.recurring_bills
     set paid_until = due, snooze_on = null,
         last_payment = jsonb_build_object('due', due, 'prev', b.paid_until, 'tx', null, 'auto_tx', t.id, 'at', now(),
           'statements', (select coalesce(jsonb_agg(s.id), '[]'::jsonb) from public.bill_statements s where s.bill_id = b.id and s.status = 'PENDING' and (s.due_date is null or s.due_date <= due + 15)))
   where id = b.id;
  -- The payment takes the bill's category when it has none yet.
  if t.category_id is null and b.category_id is not null then
    update public.transactions set category_id = b.category_id
    where id = t.id and exists (select 1 from public.categories c where c.id = b.category_id and c.type = 'EXPENSE');
  end if;
  return jsonb_build_object('settled', true, 'bill_id', b.id, 'title', b.title, 'due', due, 'next_due',
    public.bill_next_due((select r from public.recurring_bills r where r.id = b.id)));
end;
$$;
revoke all on function public.bot_bill_settle(text, bigint, uuid, text, text) from public;
grant execute on function public.bot_bill_settle(text, bigint, uuid, text, text) to anon, authenticated;

create or replace function public.unsettle_bill_on_payment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.recurring_bills;
  prev date;
begin
  for b in select * from public.recurring_bills where last_payment ->> 'auto_tx' = old.id::text loop
    if b.paid_until::text = b.last_payment ->> 'due' then
      prev := nullif(b.last_payment ->> 'prev', '')::date;
      update public.recurring_bills set paid_until = prev, last_payment = null where id = b.id;
      if jsonb_typeof(b.last_payment -> 'statements') = 'array' then
        update public.bill_statements set status = 'PENDING'
         where bill_id = b.id and status = 'PAID' and id::text in (select jsonb_array_elements_text(b.last_payment -> 'statements'));
      else
        update public.bill_statements set status = 'PENDING'
         where bill_id = b.id and status = 'PAID' and due_date is not null and (prev is null or due_date > prev + 15);
      end if;
    end if;
  end loop;
  return old;
end;
$$;

select public.apply_security_gate();
