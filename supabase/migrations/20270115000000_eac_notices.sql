-- EAC electricity notices forwarded to @luychlat_bot.
-- 1) bot_bill_scan: a bill without a due date (an EAC "new bill" notice has none) keeps
--    the bill's existing due day instead of resetting it to the 1st.
-- 2) bot_eac_paid: "ការបង់ប្រាក់ជោគជ័យ" — the customer's unpaid statement is marked PAID,
--    the bill closed for that month and the paid amount recorded as an expense (paid plans,
--    as the reminder's "paid" does). Once only: a second forward finds nothing unpaid.

create or replace function public.bot_bill_scan(p_key text, p_chat_id bigint, p_workspace_id uuid, p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  b public.recurring_bills;
  st_id uuid;
  v_kind text := case when p_bill ->> 'kind' = 'WATER' then 'WATER' else 'ELECTRICITY' end;
  v_amount numeric;
  v_cur text := case when p_bill ->> 'currency' = 'USD' then 'USD' else 'KHR' end;
  v_due date;
  v_day integer;
  v_title text := left(coalesce(nullif(btrim(p_bill ->> 'title'), ''), case when p_bill ->> 'kind' = 'WATER' then 'ថ្លៃទឹក' else 'ថ្លៃភ្លើង' end), 80);
  v_customer text := nullif(btrim(coalesce(p_bill ->> 'customer_id', '')), '');
  cat uuid;
  is_new boolean := false;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then return jsonb_build_object('status', 'not_linked'); end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(p_workspace_id) then return jsonb_build_object('status', 'not_writable'); end if;
  begin
    v_amount := round((p_bill ->> 'amount')::numeric, case when v_cur = 'KHR' then 0 else 2 end);
    v_due := nullif(p_bill ->> 'due_date', '')::date;
  exception when others then
    return jsonb_build_object('status', 'invalid');
  end;
  if v_amount is null or v_amount <= 0 or v_amount >= 1e10 then return jsonb_build_object('status', 'invalid'); end if;
  v_day := extract(day from v_due)::integer;

  -- The same bill as before: one of its statements has this customer ID, else a bill with this title.
  select x.* into b from public.recurring_bills x
  where x.workspace_id = p_workspace_id and x.kind = v_kind
    and ((v_customer is not null and exists (select 1 from public.bill_statements s where s.bill_id = x.id and s.customer_id = v_customer))
         or x.title = v_title)
  order by (v_customer is not null and exists (select 1 from public.bill_statements s where s.bill_id = x.id and s.customer_id = v_customer)) desc, x.created_at
  limit 1;

  if b.id is null then
    select c.id into cat from public.categories c
    where c.workspace_id = p_workspace_id and c.type = 'EXPENSE' and c.preset_key in ('utilities', 'housing')
    order by (c.preset_key = 'utilities') desc limit 1;
    insert into public.recurring_bills (workspace_id, created_by, title, kind, amount, currency, frequency, due_day, remind_days, category_id)
    values (p_workspace_id, link.uid, v_title, v_kind, v_amount, v_cur::public.currency_code, 'MONTHLY', coalesce(v_day, 1), '{2}', cat)
    returning * into b;
    is_new := true;
  else
    -- This month's bill: the reminder shows its amount (and its due day, when the bill gives one).
    update public.recurring_bills set amount = v_amount, currency = v_cur::public.currency_code, due_day = coalesce(v_day, due_day), is_active = true
    where id = b.id returning * into b;
  end if;

  insert into public.bill_statements (bill_id, workspace_id, due_date, amount, currency, usage, rate, invoice_no, customer_id, customer_name, location, provider, khqr_payload, created_by)
  values (b.id, p_workspace_id, v_due, v_amount, v_cur::public.currency_code,
          nullif(p_bill ->> 'usage', '')::numeric, nullif(p_bill ->> 'rate', '')::numeric,
          left(nullif(p_bill ->> 'invoice_no', ''), 40), left(v_customer, 40), left(nullif(p_bill ->> 'customer_name', ''), 60),
          left(nullif(p_bill ->> 'location', ''), 80), left(nullif(p_bill ->> 'provider', ''), 80),
          case when coalesce(p_bill ->> 'khqr', '') ~ '^000201' then left(p_bill ->> 'khqr', 512) end, link.uid)
  on conflict (bill_id, invoice_no) do update set amount = excluded.amount, due_date = coalesce(excluded.due_date, public.bill_statements.due_date),
    usage = coalesce(excluded.usage, public.bill_statements.usage), rate = coalesce(excluded.rate, public.bill_statements.rate),
    khqr_payload = coalesce(excluded.khqr_payload, public.bill_statements.khqr_payload)
  returning id into st_id;

  return jsonb_build_object('status', 'ok', 'bill_id', b.id, 'title', b.title, 'remind_days', b.remind_days,
    'statement_id', st_id, 'next_due', public.bill_next_due(b), 'new_bill', is_new);
end;
$$;

create or replace function public.bot_eac_paid(p_key text, p_chat_id bigint, p_customer_id text, p_amount numeric, p_paid_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  st public.bill_statements;
  b public.recurring_bills;
  w public.wallets_accounts;
  rate numeric;
  v_amount numeric := round(p_amount, 0);
  v_on date := least(coalesce(p_paid_on, (now() at time zone 'Asia/Phnom_Penh')::date), (now() at time zone 'Asia/Phnom_Penh')::date);
  logged boolean := false;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then return jsonb_build_object('status', 'not_linked'); end if;
  if v_amount is null or v_amount <= 0 or v_amount >= 1e10 or nullif(btrim(p_customer_id), '') is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The customer's oldest unpaid statement in one of the user's workspaces.
  select s.* into st from public.bill_statements s
  join public.workspace_members m on m.workspace_id = s.workspace_id and m.user_id = link.uid
  where s.customer_id = btrim(p_customer_id) and s.status = 'PENDING'
  order by s.due_date nulls last, s.created_at
  limit 1
  for update of s;
  if st.id is null then
    return jsonb_build_object('status', case when exists (
      select 1 from public.bill_statements s join public.workspace_members m on m.workspace_id = s.workspace_id and m.user_id = link.uid
      where s.customer_id = btrim(p_customer_id)) then 'already' else 'no_bill' end);
  end if;

  select * into b from public.recurring_bills where id = st.bill_id for update;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(b.workspace_id) then return jsonb_build_object('status', 'not_writable'); end if;

  if public.plan_code_of(link.uid) <> 'FREE' then
    select * into w from public.wallets_accounts x
    where x.workspace_id = b.workspace_id and x.archived_at is null
    order by (x.id = b.wallet_id) desc nulls last, (x.currency = 'KHR') desc, x.created_at
    limit 1;
    if w.id is not null then
      select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = b.workspace_id;
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, exchange_rate, created_by)
      values (b.workspace_id, w.id, b.category_id, v_amount, 'KHR', 'EXPENSE', v_on::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours',
              left(b.title, 500), case when w.currency <> 'KHR' then rate end, link.uid);
      logged := true;
    end if;
  end if;

  update public.bill_statements set status = 'PAID' where id = st.id;
  -- Close this month on the bill too (its reminder stops), never moving paid_until backwards.
  update public.recurring_bills set paid_until = greatest(coalesce(paid_until, public.bill_next_due(b)), public.bill_next_due(b)),
    snooze_on = null, wallet_id = coalesce(w.id, wallet_id)
  where id = b.id;
  return jsonb_build_object('status', 'paid', 'title', b.title, 'logged', logged, 'wallet', w.name);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_bill_scan(text, bigint, uuid, jsonb)', 'public.bot_eac_paid(text, bigint, text, numeric, date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
