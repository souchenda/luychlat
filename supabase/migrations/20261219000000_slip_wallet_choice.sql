-- Bank slips never guess the wallet.
--
-- 1. When the slip's account number does not pick exactly one wallet (two
--    ACLEDA KHR wallets, a number that matches neither…), the pending entry is
--    stored with wallet_pending = true and the candidate ids in wallet_choices;
--    the bot asks "which wallet?" with one button each.
-- 2. bot_confirm refuses such an entry (wallet_unresolved) — nothing can book it
--    until bot_pending_wallet sets one of the offered wallets.
-- 3. bot_tx_tag also returns the wallet's account number (the saved card shows
--    "👛 ACLEDA KHR · 016***4222").

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
  d public.debts;
  rate numeric;
  currency text;
  tx_type public.transaction_type;
  ws_name text;
  posted timestamptz;
  receipt text;
  tx_id uuid;
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

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, receipt_url)
  values (ws, w.id, (a ->> 'category_id')::uuid, (a ->> 'amount')::numeric, currency::public.currency_code, tx_type,
          case when currency = w.currency::text then null else rate end, left(nullif(a ->> 'note', ''), 500), posted, receipt)
  returning id into tx_id;
  select * into w from public.wallets_accounts where id = w.id;
  return jsonb_build_object('ok', true, 'kind', a ->> 'kind', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency, 'workspace', ws_name, 'tx_id', tx_id);
end;
$$;

create or replace function public.bot_tx_tag(p_key text, p_chat_id bigint, p_tx_id uuid, p_subcategory text default null, p_need_want text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  w_name text;
  w_acct text;
  c public.categories;
begin
  perform public.require_bot(p_key);
  if p_subcategory is not null and p_subcategory not in ('breakfast', 'lunch', 'dinner', 'snack') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  if p_need_want is not null and p_need_want not in ('NEED', 'WANT') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;

  select * into t from public.transactions
   where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '30 days';
  if t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;

  update public.transactions
     set subcategory = coalesce(p_subcategory, subcategory),
         need_want = coalesce(p_need_want, need_want)
   where id = t.id
  returning * into t;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want);
end;
$$;


create or replace function public.bot_pending_wallet(p_key text, p_chat_id bigint, p_pending_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
begin
  perform public.require_bot(p_key);
  select action into a from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id and expires_at >= now();
  if a is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  -- Only one of the wallets the user was offered.
  if not coalesce(a -> 'wallet_choices' ? p_wallet_id::text, false) then
    raise exception 'invalid_wallet' using errcode = '22023';
  end if;
  update public.telegram_pending
     set action = (action - 'wallet_pending' - 'wallet_choices') || jsonb_build_object('wallet_id', p_wallet_id)
   where id = p_pending_id
  returning action into a;
  return jsonb_build_object('ok', true, 'action', a);
end;
$$;

revoke all on function public.bot_pending_wallet(text, bigint, uuid, uuid) from public;
grant execute on function public.bot_pending_wallet(text, bigint, uuid, uuid) to anon, authenticated;

select public.apply_security_gate();
