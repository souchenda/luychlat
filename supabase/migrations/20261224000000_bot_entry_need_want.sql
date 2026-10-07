-- Need / Want for entries typed or spoken to the bot ("បាយ 10000៛" → ចាំបាច់,
-- "កាហ្វេ 2$" → ចំណង់): the bot works out the default (and the meal of a food
-- entry) when it reads the message and keeps them on the pending entry;
-- bot_confirm now stores them. The saved card then lets the user switch.

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
