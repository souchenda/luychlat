-- Bills settle themselves (founder, 09/10): a slip or bank alert paying EDC / water /
-- internet marks the matching recurring bill «បង់រួច» for its current cycle — no tap in the app.
-- Only a certain match settles:
--   * the payment names the bill's customer number (EDC 539-011687 → House 35), or
--   * the payee says which kind (electricity / water / internet), there is exactly ONE active
--     bill of that kind in the workspace, the amount is within 15% of it, and it is due now
--     (next due date at most 20 days ahead).
-- The bill remembers which entry paid it: deleting that entry (↩️ Undo, 🗑️) makes it unpaid again.

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
         last_payment = jsonb_build_object('due', due, 'prev', b.paid_until, 'tx', null, 'auto_tx', t.id, 'at', now())
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

-- The entry that settled a bill is deleted → the bill is unpaid again (and its statements).
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
      update public.bill_statements set status = 'PENDING'
       where bill_id = b.id and status = 'PAID' and due_date is not null and (prev is null or due_date > prev + 15);
    end if;
  end loop;
  return old;
end;
$$;
drop trigger if exists transactions_unsettle_bill on public.transactions;
create trigger transactions_unsettle_bill after delete on public.transactions
  for each row execute function public.unsettle_bill_on_payment_delete();

select public.apply_security_gate();
