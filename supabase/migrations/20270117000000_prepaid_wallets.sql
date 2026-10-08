-- Prepaid service wallets: the EV charging apps' balance (EVX, Charge+…) and the
-- Phnom Penh – Sihanoukville Expressway ANPR toll balance. Each is an ordinary USD
-- wallet marked by its icon (prepaid_ev / prepaid_toll), created on the first top-up.
--   * "ថប់អាប់សាកឡាន 50$ ABA": a TRANSFER from ABA to the prepaid wallet (no expense yet).
--   * "សាកឡានក្រៅ 8.5$" / "កាត់ល្បឿនលឿន 12$": an expense out of that wallet (the bot picks it).
--   * /car: this month's home kWh, public charging, tolls and the prepaid balances.
--   * /wallets, /balance: balances in chat — only with the opt-in "AI may see my numbers"
--     (telegram_links.ai_numbers, off by default), as the weekly digest; else the app pointer.

create index if not exists wallets_accounts_prepaid_idx on public.wallets_accounts (workspace_id, icon) where icon in ('prepaid_ev', 'prepaid_toll');

create or replace function public.bot_confirm(p_key text, p_chat_id bigint, p_pending_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.telegram_pending;
  link record;
  a jsonb;
  ws uuid;
  w public.wallets_accounts;
  tw public.wallets_accounts;
  d public.debts;
  rate numeric;
  currency text;
  tx_type public.transaction_type;
  ws_name text;
  posted timestamptz;
  receipt text;
  tx_id uuid;
  v_icon text;
  v_amount numeric;
begin
  perform public.require_bot(p_key);
  delete from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id and expires_at >= now() returning * into p;
  if p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  link := public.bot_chat_link(p_chat_id);
  if link.uid is distinct from p.user_id or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(p.user_id) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  a := p.action;
  -- A slip whose wallet the user has not chosen yet is never booked (no silent guess).
  if coalesce((a ->> 'wallet_pending')::boolean, false) then raise exception 'wallet_unresolved' using errcode = 'P0001'; end if;
  ws := (a ->> 'workspace_id')::uuid;
  perform public.bot_act_as(p.user_id);
  if not public.bot_ws_allowed(p.user_id, link.ws, link.route_all, ws) then raise exception 'not_writable' using errcode = '42501'; end if;
  select name into ws_name from public.workspaces where id = ws;

  select * into w from public.wallets_accounts where id = (a ->> 'wallet_id')::uuid and workspace_id = ws and archived_at is null;
  if w.id is null then raise exception 'invalid_wallet' using errcode = '22023'; end if;
  if w.visibility = 'PERSONAL' and w.owner_id is not null and w.owner_id <> p.user_id then raise exception 'invalid_wallet' using errcode = '42501'; end if;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = ws;

  -- A top-up of a prepaid wallet: money moves from the source wallet, nothing is spent yet.
  if a ->> 'kind' = 'TOPUP' then
    v_icon := case a ->> 'prepaid' when 'EV' then 'prepaid_ev' when 'TOLL' then 'prepaid_toll' end;
    if v_icon is null or w.icon = v_icon then raise exception 'invalid_wallet' using errcode = '22023'; end if;
    select * into tw from public.wallets_accounts x where x.workspace_id = ws and x.icon = v_icon and x.archived_at is null order by x.created_at limit 1;
    if tw.id is null then
      insert into public.wallets_accounts (workspace_id, name, currency, icon, owner_id)
      values (ws, case v_icon when 'prepaid_ev' then 'កាបូបសាកឡាន (EV App Wallet)' else 'កាបូបផ្លូវល្បឿនលឿន (Expressway ANPR)' end, 'USD', v_icon, p.user_id)
      returning * into tw;
    end if;
    v_amount := (a ->> 'amount')::numeric;
    currency := a ->> 'currency';
    if v_amount is null or v_amount <= 0 or currency not in ('USD', 'KHR') then raise exception 'invalid_amount' using errcode = '22023'; end if;
    insert into public.transactions (workspace_id, wallet_id, to_wallet_id, amount, currency, to_amount, type, exchange_rate, note, transaction_date)
    values (ws, w.id, tw.id,
            public.amount_in_wallet_currency(v_amount, currency::public.currency_code, rate, w.currency), w.currency,
            public.amount_in_wallet_currency(v_amount, currency::public.currency_code, rate, tw.currency), 'TRANSFER',
            case when w.currency <> tw.currency then rate end, left(nullif(a ->> 'note', ''), 500), now())
    returning id into tx_id;
    return jsonb_build_object('ok', true, 'kind', 'TOPUP', 'wallet', tw.name, 'from', w.name, 'workspace', ws_name, 'tx_id', tx_id);
  end if;

  if a ->> 'kind' = 'REPAY' then
    select * into d from public.debts where id = (a ->> 'debt_id')::uuid and workspace_id = ws;
    if d.id is null then raise exception 'invalid_debt' using errcode = '22023'; end if;
    perform public.record_debt_repayment(d.id, w.id, (a ->> 'amount')::numeric, rate, now(), nullif(a ->> 'note', ''));
    select * into d from public.debts where id = d.id;
    select * into w from public.wallets_accounts where id = w.id;
    return jsonb_build_object('ok', true, 'kind', 'REPAY', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency,
      'remaining', d.total_amount - d.paid_amount, 'debt_currency', d.currency, 'party', d.party_name, 'workspace', ws_name);
  end if;

  currency := a ->> 'currency';
  tx_type := (a ->> 'kind')::public.transaction_type;
  if (a ->> 'category_id') is not null and not exists (
    select 1 from public.categories c where c.id = (a ->> 'category_id')::uuid and c.workspace_id = ws and c.type::text = a ->> 'kind'
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  -- A slip's own date (noon Cambodia time for a bare date), within sane bounds.
  begin
    posted := case
      when a ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then ((a ->> 'date') || ' 12:00')::timestamp at time zone 'Asia/Phnom_Penh'
      else (a ->> 'date')::timestamptz
    end;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;
  receipt := case when a ->> 'receipt' ~ '^[A-Za-z0-9_-]{10,200}$' then p.user_id::text || '/tg/' || (a ->> 'receipt') end;

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, receipt_url, subcategory, need_want)
  values (ws, w.id, (a ->> 'category_id')::uuid, (a ->> 'amount')::numeric, currency::public.currency_code, tx_type,
          case when currency = w.currency::text then null else rate end, left(nullif(a ->> 'note', ''), 500), posted, receipt,
          -- Typed / spoken entries carry their meal and Need / Want default (only valid values, expenses only).
          case when tx_type = 'EXPENSE' and a ->> 'subcategory' in ('breakfast', 'lunch', 'dinner', 'snack') then a ->> 'subcategory' end,
          case when tx_type = 'EXPENSE' and a ->> 'need_want' in ('NEED', 'WANT') then a ->> 'need_want' end)
  returning id into tx_id;
  select * into w from public.wallets_accounts where id = w.id;
  return jsonb_build_object('ok', true, 'kind', a ->> 'kind', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency, 'workspace', ws_name, 'tx_id', tx_id);
end;
$$;

-- /car, /ev: this month's vehicle costs. kWh always; money only with ai_numbers on.
create or replace function public.bot_car_report(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  numbers boolean;
  rate numeric;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  kwh numeric;
  kwh_rate numeric;
  out jsonb;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  perform public.bot_act_as(link.uid);
  if not public.is_workspace_member(link.ws) then return jsonb_build_object('status', 'not_linked'); end if;
  select coalesce(t.ai_numbers, false) into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = link.ws;

  select coalesce(sum(e.kwh), 0) into kwh from public.ev_charge_logs e where e.workspace_id = link.ws and e.charged_at >= month_start;
  out := jsonb_build_object('status', 'ok', 'numbers', coalesce(numbers, false), 'home_kwh', kwh);
  if not coalesce(numbers, false) then return out; end if;

  -- The home rate: the latest electricity statement's riel per kWh.
  select s.rate into kwh_rate from public.bill_statements s join public.recurring_bills b on b.id = s.bill_id
  where s.workspace_id = link.ws and b.kind = 'ELECTRICITY' and s.rate is not null and s.currency = 'KHR'
  order by s.created_at desc limit 1;

  with tx as (
    select t.amount, t.currency, w.icon, t.note
    from public.transactions t join public.wallets_accounts w on w.id = t.wallet_id
    where t.workspace_id = link.ws and t.type = 'EXPENSE' and t.transaction_date >= month_start
      and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = link.uid)
  )
  select out || jsonb_build_object(
    'home_khr', case when kwh_rate is not null then round(kwh * kwh_rate, 0) end,
    'public_usd', round(coalesce((select sum(case when currency = 'USD' then amount else amount / rate end) from tx
                                  where icon = 'prepaid_ev' or note like '%⚡ សាកភ្លើង EV%'), 0), 2),
    'toll_usd', round(coalesce((select sum(case when currency = 'USD' then amount else amount / rate end) from tx
                                where icon = 'prepaid_toll' or note like '%🛣️ ផ្លូវល្បឿនលឿន%'), 0), 2),
    'ev_balance', (select x.balance from public.wallets_accounts x where x.workspace_id = link.ws and x.icon = 'prepaid_ev' and x.archived_at is null order by x.created_at limit 1),
    'toll_balance', (select x.balance from public.wallets_accounts x where x.workspace_id = link.ws and x.icon = 'prepaid_toll' and x.archived_at is null order by x.created_at limit 1))
  into out;
  return out;
end;
$$;

-- /wallets, /balance: the account's wallets with balances — only with ai_numbers on.
create or replace function public.bot_wallet_balances(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  numbers boolean;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  select coalesce(t.ai_numbers, false) into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  if not coalesce(numbers, false) then return jsonb_build_object('status', 'off'); end if;
  perform public.bot_act_as(link.uid);
  if not public.is_workspace_member(link.ws) then return jsonb_build_object('status', 'not_linked'); end if;
  return jsonb_build_object('status', 'ok', 'wallets', coalesce((
    select jsonb_agg(jsonb_build_object('name', w.name, 'currency', w.currency, 'balance', w.balance, 'icon', w.icon, 'kind', w.kind) order by w.sort_order, w.created_at)
    from public.wallets_accounts w
    where w.workspace_id = link.ws and w.archived_at is null
      and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = link.uid)), '[]'::jsonb));
end;
$$;

-- A top-up card (kind TOPUP) may be proposed like any entry.
create or replace function public.bot_propose(p_key text, p_chat_id bigint, p_action jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  kind text := p_action ->> 'kind';
  amount numeric := (p_action ->> 'amount')::numeric;
  target uuid;
  new_id uuid;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  perform public.bot_act_as(link.uid);
  target := coalesce((p_action ->> 'workspace_id')::uuid, link.ws);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, target) then
    raise exception 'not_writable' using errcode = '42501';
  end if;
  if kind not in ('EXPENSE', 'INCOME', 'REPAY', 'TOPUP') or amount is null or amount <= 0 or amount > 1e12 then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if not exists (select 1 from public.wallets_accounts w where w.id = (p_action ->> 'wallet_id')::uuid and w.workspace_id = target and w.archived_at is null) then
    raise exception 'invalid_wallet' using errcode = '22023';
  end if;
  if kind = 'REPAY' then
    if not exists (select 1 from public.debts d where d.id = (p_action ->> 'debt_id')::uuid and d.workspace_id = target and d.status <> 'SETTLED') then
      raise exception 'invalid_debt' using errcode = '22023';
    end if;
  elsif kind = 'TOPUP' then
    -- A prepaid wallet's top-up: a transfer, created (with its wallet) by bot_confirm.
    if (p_action ->> 'currency') not in ('USD', 'KHR') or coalesce(p_action ->> 'prepaid', '') not in ('EV', 'TOLL') then
      raise exception 'invalid_action' using errcode = '22023';
    end if;
  else
    if (p_action ->> 'currency') not in ('USD', 'KHR') then raise exception 'invalid_action' using errcode = '22023'; end if;
    if (p_action ->> 'category_id') is not null and not exists (
      select 1 from public.categories c where c.id = (p_action ->> 'category_id')::uuid and c.workspace_id = target and c.type::text = kind
    ) then
      raise exception 'invalid_category' using errcode = '22023';
    end if;
  end if;
  -- One open card per chat: a new message (or a workspace switch) replaces the previous proposal.
  delete from public.telegram_pending where chat_id = p_chat_id or expires_at < now();
  insert into public.telegram_pending (user_id, chat_id, action)
  values (link.uid, p_chat_id, p_action || jsonb_build_object('workspace_id', target))
  returning id into new_id;
  return new_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_propose(text, bigint, jsonb)', 'public.bot_confirm(text, bigint, uuid)', 'public.bot_car_report(text, bigint)', 'public.bot_wallet_balances(text, bigint)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
