-- 1) bot_bill_scan: a bill's customer number decides its workspace (House 35 in the business,
--    House 37 in Personal), not the chat's default workspace.
-- 2) bot_khqr_ingest_document: ABA Business transaction-detail PDFs from AUTOBOK.

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
  v_home uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then return jsonb_build_object('status', 'not_linked'); end if;
  perform public.bot_act_as(link.uid);
  -- A customer number that already has a bill belongs where that bill is (House 35 → the business,
  -- House 37 → Personal), whichever workspace the chat writes to by default.
  if nullif(btrim(coalesce(p_bill ->> 'customer_id', '')), '') is not null then
    select b2.workspace_id into v_home from public.bill_statements s2
    join public.recurring_bills b2 on b2.id = s2.bill_id
    join public.workspace_members m2 on m2.workspace_id = b2.workspace_id and m2.user_id = link.uid
    where s2.customer_id = btrim(p_bill ->> 'customer_id')
    order by s2.created_at desc limit 1;
    if v_home is not null then p_workspace_id := v_home; end if;
  end if;
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
    'statement_id', st_id, 'next_due', public.bill_next_due(b), 'new_bill', is_new,
    'workspace', (select w.name from public.workspaces w where w.id = p_workspace_id));
end;
$$;

-- ABA Business "TRANSACTION DETAILS" PDF (transaction-detail_<FT>.pdf) pushed by the business's
-- own tool (AUTOBOK) with its lck_ key: a B2B customer's transfer, read on the server
-- (src/lib/bot/aba-transaction-pdf.ts). It goes to the wallet whose account number is the PDF's
-- "To account". Always the business's Sales; when that wallet is in another workspace (Personal),
-- the sale is booked in the business's ABA wallet and moved to it (out / in pair), as the
-- owner chose on 08/10 for 100FT39125992444. Once per FT reference.
create or replace function public.bot_khqr_ingest_document(p_key text, p_key_hash text, p_doc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.khqr_api_keys;
  ws public.workspaces;
  tw public.wallets_accounts;
  bw public.wallets_accounts;
  v_amount numeric;
  v_cur text := upper(btrim(coalesce(p_doc ->> 'currency', '')));
  v_ref text := lower(btrim(coalesce(p_doc ->> 'reference', '')));
  v_to text := regexp_replace(coalesce(p_doc ->> 'to_account', ''), '\D', '', 'g');
  payer text := left(nullif(btrim(coalesce(p_doc ->> 'payer', '')), ''), 120);
  remark text := left(nullif(btrim(coalesce(p_doc ->> 'remark', '')), ''), 120);
  posted timestamptz;
  sales uuid;
  c_out uuid;
  c_in uuid;
  t1 uuid;
  note text;
begin
  perform public.require_bot(p_key);
  select * into k from public.khqr_api_keys where key_hash = lower(coalesce(p_key_hash, ''));
  if k.workspace_id is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if not exists (select 1 from public.workspaces w where w.id = k.workspace_id and w.user_id = k.created_by)
     or exists (select 1 from public.account_controls c where c.user_id = k.created_by and c.suspended_at is not null) then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  update public.khqr_api_keys set last_used_at = now() where workspace_id = k.workspace_id;
  if not public.biz_group_allowed(k.created_by) then return jsonb_build_object('status', 'plan_required'); end if;
  begin
    v_amount := (p_doc ->> 'amount')::numeric;
    posted := (p_doc ->> 'posted_at')::timestamptz;
  exception when others then
    return jsonb_build_object('status', 'invalid');
  end;
  if v_amount is null or v_amount <= 0 or v_amount >= 1e10 or v_cur not in ('USD', 'KHR') or v_ref !~ '^[a-z0-9]{8,30}$'
     or length(v_to) not between 6 and 20 or payer is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_amount := round(v_amount, case when v_cur = 'KHR' then 0 else 2 end);
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then posted := now(); end if;

  select * into ws from public.workspaces where id = k.workspace_id;
  if ws.type <> 'BUSINESS' then return jsonb_build_object('status', 'invalid'); end if;
  perform public.bot_act_as(k.created_by);
  if not public.can_write_workspace(ws.id) then return jsonb_build_object('status', 'not_writable'); end if;
  if exists (select 1 from public.khqr_payments p where p.workspace_id = ws.id and p.bank = 'ABA' and p.ref = v_ref) then
    return jsonb_build_object('status', 'duplicate', 'workspace', ws.name,
      'transaction_id', (select p.transaction_id from public.khqr_payments p where p.workspace_id = ws.id and p.bank = 'ABA' and p.ref = v_ref));
  end if;

  -- The receiving wallet: its account number is the PDF's To account (the business's own first).
  select x.* into tw from public.wallets_accounts x
  join public.workspace_members m on m.workspace_id = x.workspace_id and m.user_id = k.created_by
  where x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
    and regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g') = v_to
    and (x.visibility <> 'PERSONAL' or x.owner_id is null or x.owner_id = k.created_by)
  order by (x.workspace_id = ws.id) desc, (x.currency::text = v_cur) desc, x.created_at
  limit 1;
  if tw.id is null then
    return jsonb_build_object('status', 'no_wallet', 'workspace_id', ws.id, 'workspace', ws.name, 'to_account', v_to, 'amount', v_amount, 'currency', v_cur);
  end if;
  if tw.workspace_id <> ws.id and not public.can_write_workspace(tw.workspace_id) then
    return jsonb_build_object('status', 'not_writable');
  end if;

  sales := coalesce(
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'sales' limit 1),
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'other_income' limit 1));
  note := left(payer || coalesce(' · ' || remark, '') || ' · ABA FT ' || upper(v_ref), 480);

  if tw.workspace_id = ws.id then
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by, bank_ref)
    values (ws.id, tw.id, sales, v_amount, v_cur::public.currency_code, 'INCOME',
            case when v_cur <> tw.currency::text then coalesce(ws.khr_per_usd, 4000) end, note, posted, k.created_by, v_ref)
    returning id into t1;
  else
    -- Paid into a wallet of another workspace (e.g. a personal account): the business's sale, then moved there.
    select x.* into bw from public.wallets_accounts x
    where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
    order by ((lower(coalesce(x.icon, '')) = 'aba' or lower(x.name) ~ '(^|[^a-z])aba([^a-z]|$)') and x.currency::text = v_cur) desc,
             (x.currency::text = v_cur) desc, x.created_at
    limit 1;
    if bw.id is null then return jsonb_build_object('status', 'no_wallet', 'workspace', ws.name, 'to_account', v_to); end if;
    c_out := public.ensure_preset_category(ws.id, 'workspace_transfer_out', 'EXPENSE', 'arrow-left-right', '#64748b', 'ផ្ទេរទៅកន្លែងធ្វើការផ្សេង');
    c_in := public.ensure_preset_category(tw.workspace_id, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by, bank_ref)
    values (ws.id, bw.id, sales, v_amount, v_cur::public.currency_code, 'INCOME',
            case when v_cur <> bw.currency::text then coalesce(ws.khr_per_usd, 4000) end, note || ' (បង់ចូល ' || v_to || ')', posted, k.created_by, v_ref)
    returning id into t1;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
    values (ws.id, bw.id, c_out, v_amount, v_cur::public.currency_code, 'EXPENSE',
            case when v_cur <> bw.currency::text then coalesce(ws.khr_per_usd, 4000) end,
            left('→ ' || tw.name || ' · ប្រាក់ចូលគណនីផ្សេង · FT ' || upper(v_ref), 480), posted + interval '1 second', k.created_by);
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
    values (tw.workspace_id, tw.id, c_in, v_amount, v_cur::public.currency_code, 'INCOME',
            case when v_cur <> tw.currency::text then (select coalesce(w.khr_per_usd, 4000) from public.workspaces w where w.id = tw.workspace_id) end,
            left('← ' || ws.name || ' · ' || payer || ' · FT ' || upper(v_ref), 480), posted + interval '1 second', k.created_by);
  end if;
  insert into public.khqr_payments (workspace_id, bank, ref, transaction_id, payer) values (ws.id, 'ABA', v_ref, t1, left(payer, 80))
  on conflict do nothing;
  return jsonb_build_object('status', 'ok', 'transaction_id', t1, 'workspace_id', ws.id, 'workspace', ws.name,
    'wallet', coalesce(bw.name, tw.name), 'moved_to', case when bw.id is not null then tw.name end,
    'amount', v_amount, 'currency', v_cur, 'bank', 'ABA', 'posted_at', posted, 'reference', upper(v_ref));
end;
$$;

-- 100FT39125992444 ($186, recorded by hand on 08/10): never again if AUTOBOK sends that PDF.
insert into public.khqr_payments (workspace_id, bank, ref, transaction_id, payer)
select t.workspace_id, 'ABA', '100ft39125992444', t.id, 'K2SM CLOUD INVESTMENTS COMPANY LIMITED'
from public.transactions t
where t.type = 'INCOME' and t.note like 'K2SM CLOUD INVESTMENTS%100FT39125992444%'
on conflict do nothing;
update public.transactions set bank_ref = '100ft39125992444'
where type = 'INCOME' and note like 'K2SM CLOUD INVESTMENTS%100FT39125992444%' and bank_ref is null;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_bill_scan(text, bigint, uuid, jsonb)', 'public.bot_khqr_ingest_document(text, text, jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
