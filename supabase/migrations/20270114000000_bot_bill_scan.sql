-- A utility bill photo sent to @luychlat_bot: saved as a monthly bill (or this month's
-- statement of the same bill — same customer ID, else same title) with a 2-day reminder,
-- and the KHQR printed on the bill kept so the bot can hand it back to pay.

alter table public.bill_statements add column if not exists khqr_payload text
  check (khqr_payload is null or (khqr_payload ~ '^000201' and char_length(khqr_payload) between 20 and 512));

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
  v_day := coalesce(extract(day from v_due)::integer, 1);

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
    values (p_workspace_id, link.uid, v_title, v_kind, v_amount, v_cur::public.currency_code, 'MONTHLY', v_day, '{2}', cat)
    returning * into b;
    is_new := true;
  else
    -- This month's bill: the reminder shows its amount and due day.
    update public.recurring_bills set amount = v_amount, currency = v_cur::public.currency_code, due_day = v_day, is_active = true
    where id = b.id returning * into b;
  end if;

  insert into public.bill_statements (bill_id, workspace_id, due_date, amount, currency, usage, rate, invoice_no, customer_id, customer_name, location, provider, khqr_payload, created_by)
  values (b.id, p_workspace_id, v_due, v_amount, v_cur::public.currency_code,
          nullif(p_bill ->> 'usage', '')::numeric, nullif(p_bill ->> 'rate', '')::numeric,
          left(nullif(p_bill ->> 'invoice_no', ''), 40), left(v_customer, 40), left(nullif(p_bill ->> 'customer_name', ''), 60),
          left(nullif(p_bill ->> 'location', ''), 80), left(nullif(p_bill ->> 'provider', ''), 80),
          case when coalesce(p_bill ->> 'khqr', '') ~ '^000201' then left(p_bill ->> 'khqr', 512) end, link.uid)
  on conflict (bill_id, invoice_no) do update set amount = excluded.amount, due_date = excluded.due_date, usage = excluded.usage,
    rate = excluded.rate, khqr_payload = coalesce(excluded.khqr_payload, public.bill_statements.khqr_payload)
  returning id into st_id;

  return jsonb_build_object('status', 'ok', 'bill_id', b.id, 'title', b.title, 'remind_days', b.remind_days,
    'statement_id', st_id, 'next_due', public.bill_next_due(b), 'new_bill', is_new);
end;
$$;

-- The KHQR printed on a scanned bill (the bot's [💳 ស្កេនបង់ប្រាក់]) — the linked user's own.
create or replace function public.bot_bill_khqr(p_key text, p_chat_id bigint, p_statement_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then return null; end if;
  return (select s.khqr_payload from public.bill_statements s
          join public.workspace_members m on m.workspace_id = s.workspace_id and m.user_id = link.uid
          where s.id = p_statement_id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_bill_scan(text, bigint, uuid, jsonb)', 'public.bot_bill_khqr(text, bigint, uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
