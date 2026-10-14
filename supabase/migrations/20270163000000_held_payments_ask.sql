-- Ask, never guess, which wallet money goes into (founder, 14/10/2026):
--   1. KHQR sales: no wallet of the RECEIVING bank → the payment is held and the business owner is asked
--      (Telegram buttons + a bell notification). Never dropped into Cash or another bank's wallet.
--   2. Bank SMS alerts: two or more wallets ending in the same 3–4 digits → held, the person picks.
-- A tap books it through the same function (khqr_record / bot_bank_alert) with the chosen wallet, so every
-- check (plan, write access, duplicates, own transfers, the alert fingerprint) runs again.

create table if not exists public.bot_held_payments (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('KHQR', 'BANK_ALERT')),
  user_id        uuid not null references auth.users (id) on delete cascade,
  workspace_id   uuid references public.workspaces (id) on delete cascade,
  chat_id        bigint,
  dedup          text not null,
  payload        jsonb not null,
  choices        jsonb not null,
  created_at     timestamptz not null default now(),
  booked_at      timestamptz,
  transaction_id uuid,
  unique (kind, dedup)
);
alter table public.bot_held_payments enable row level security;
revoke all on public.bot_held_payments from public, anon, authenticated;
create index if not exists bot_held_payments_open_idx on public.bot_held_payments (workspace_id) where booked_at is null;

CREATE OR REPLACE FUNCTION public.khqr_record(p_ws uuid, p_uid uuid, p_pay jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ws public.workspaces;
  w public.wallets_accounts;
  src public.wallets_accounts;
  v_bank text := upper(btrim(coalesce(p_pay ->> 'bank', '')));
  amount numeric;
  v_cur text := upper(btrim(coalesce(p_pay ->> 'currency', '')));
  v_ref text := lower(btrim(coalesce(p_pay ->> 'ref', '')));
  payer text := left(nullif(btrim(coalesce(p_pay ->> 'payer', '')), ''), 80);
  v_name text;
  v_suffix text;
  v_merchant text := public.khqr_payer_name(p_pay ->> 'merchant');
  own boolean := false;
  n int;
  posted timestamptz;
  category_id uuid;
  tx_id uuid;
  bank_re text;
  choices jsonb;
  held_id uuid;
  fresh boolean;
begin
  if not public.biz_group_allowed(p_uid) then
    return jsonb_build_object('status', 'plan_required');
  end if;
  begin
    amount := (p_pay ->> 'amount')::numeric;
  exception when others then
    amount := null;
  end;
  if v_bank not in ('ACLEDA', 'ABA') or amount is null or amount <= 0 or amount >= 1e12 or v_cur not in ('USD', 'KHR') or v_ref !~ '^[a-z0-9]{4,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  amount := round(amount, case when v_cur = 'KHR' then 0 else 2 end);
  -- The bank that RECEIVED it, by its reference: a customer's ABA app scanning the ACLEDA stand
  -- arrives labelled "ABA" (the payer's bank) with ACLEDA's reference, and vice versa.
  v_bank := public.khqr_receiving_bank(v_bank, v_ref);
  select * into ws from public.workspaces where id = p_ws;
  if ws.id is null or ws.type <> 'BUSINESS' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform public.bot_act_as(p_uid);
  if not public.can_write_workspace(ws.id) then
    return jsonb_build_object('status', 'not_writable');
  end if;

  -- Already recorded (a retry, the same payment twice, or the group listener got it first).
  if exists (select 1 from public.khqr_payments k where k.workspace_id = ws.id and k.bank = v_bank and k.ref = v_ref) then
    return jsonb_build_object('status', 'duplicate', 'workspace', ws.name,
      'transaction_id', (select k.transaction_id from public.khqr_payments k where k.workspace_id = ws.id and k.bank = v_bank and k.ref = v_ref));
  end if;

  -- The wallet: the one the owner picked for a held payment, else the RECEIVING bank's wallet (in this
  -- currency first). A wallet is the bank's by the bank picked for it (icon 'aba' / 'acleda') or by its name.
  -- No wallet of that bank: the payment is HELD and the owner is asked which wallet — never dropped into
  -- Cash or another bank's wallet (founder, 14/10/2026).
  bank_re := case when v_bank = 'ACLEDA' then '(acleda|អេស៊ីលីដា)' else '(^|[^a-z])aba([^a-z]|$)' end;
  if nullif(p_pay ->> 'wallet_id', '') is not null then
    select x.* into w from public.wallets_accounts x
    where x.id::text = p_pay ->> 'wallet_id' and x.workspace_id = ws.id and x.archived_at is null
      and coalesce(x.kind::text, '') <> 'CREDIT_CARD';
    if w.id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
  else
    select x.* into w from public.wallets_accounts x
    where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
      and (lower(coalesce(x.icon, '')) = lower(v_bank) or lower(x.name) ~ bank_re)
    order by (x.currency::text = v_cur) desc, x.created_at
    limit 1;
  end if;
  if w.id is null then
    choices := coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'currency', c.currency) order by c.ord)
      from (select x.id, x.name, x.currency, row_number() over (order by (x.currency::text = v_cur) desc, x.created_at) as ord
            from public.wallets_accounts x
            where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD') c
      where c.ord <= 8), '[]'::jsonb);
    if jsonb_array_length(choices) = 0 then
      return jsonb_build_object('status', 'no_wallet', 'workspace', ws.name);
    end if;
    insert into public.bot_held_payments (kind, user_id, workspace_id, dedup, payload, choices)
    values ('KHQR', p_uid, ws.id, ws.id::text || ':' || v_bank || ':' || v_ref,
            p_pay || jsonb_build_object('bank', v_bank, 'ref', v_ref), choices)
    on conflict (kind, dedup) do nothing
    returning id into held_id;
    fresh := held_id is not null;
    if not fresh then
      select h.id, h.choices into held_id, choices from public.bot_held_payments h
      where h.kind = 'KHQR' and h.dedup = ws.id::text || ':' || v_bank || ':' || v_ref;
    else
      -- Also on the bell in the app, so it is never only in a chat that may not be linked.
      insert into public.notifications (workspace_id, title, message, type, alert_key)
      values (ws.id, '⚠️ ប្រាក់ចូល KHQR មិនទាន់កត់ត្រា',
              public.format_money_text(amount, v_cur::public.currency_code) || coalesce(' ពី ' || payer, '') || ' (' || v_bank || ')'
                || ' · គ្មានកាបូប ' || v_bank || ' ទេ — សូមជ្រើសកាបូបក្នុង Telegram @luychlat_bot ឬបង្កើតកាបូប ' || v_bank || '។',
              'SYSTEM', 'KHQR_HOLD:' || held_id::text);
    end if;
    return jsonb_build_object('status', 'ask', 'held_id', held_id, 'fresh', fresh, 'choices', choices,
      'workspace', ws.name, 'amount', amount, 'currency', v_cur, 'bank', v_bank, 'payer', payer);
  end if;

  begin
    posted := (p_pay ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;

  -- The owner's own transfer? (See the header: suffix → one wallet, and the payer is the owner.)
  v_name := public.khqr_payer_name(payer);
  v_suffix := coalesce(substring(coalesce(p_pay ->> 'payer_account', '') from '(\d{3,})\D*$'), public.khqr_payer_suffix(payer));
  if v_name is not null and v_suffix is not null and w.currency::text = v_cur then
    own := v_name = v_merchant or exists (
      select 1 from public.khqr_payments k join public.transactions t on t.id = k.transaction_id
      where k.workspace_id = ws.id and t.type = 'TRANSFER' and public.khqr_payer_name(k.payer) = v_name);
  end if;
  if own then
    select count(*) into n from public.wallets_accounts x
    where x.workspace_id = ws.id and x.archived_at is null and x.id <> w.id and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
      and x.currency::text = v_cur
      and (regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g') like '%' || v_suffix
           or coalesce(substring(x.name from '(\d+)\D*$'), '') like '%' || v_suffix);
    if n = 1 then
      select x.* into src from public.wallets_accounts x
      where x.workspace_id = ws.id and x.archived_at is null and x.id <> w.id and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
        and x.currency::text = v_cur
        and (regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g') like '%' || v_suffix
             or coalesce(substring(x.name from '(\d+)\D*$'), '') like '%' || v_suffix);
      -- The bank already moved it: a source wallet behind in the app may dip below zero.
      perform set_config('luysmart.import', 'on', true);
      insert into public.transactions (workspace_id, wallet_id, to_wallet_id, amount, to_amount, currency, type, note, transaction_date, created_by, bank_ref)
      values (ws.id, src.id, w.id, amount, amount, v_cur::public.currency_code, 'TRANSFER',
              left('ផ្ទេរប្រាក់ផ្ទៃក្នុង KHQR ពី ' || coalesce(payer, '—') || ' (Ref: ' || v_ref || ')', 500), posted, p_uid, left(v_ref, 64))
      returning id into tx_id;
      perform set_config('luysmart.import', 'off', true);
      insert into public.khqr_payments (workspace_id, bank, ref, transaction_id, payer) values (ws.id, v_bank, v_ref, tx_id, payer)
      on conflict do nothing;
      return jsonb_build_object('status', 'transfer', 'transaction_id', tx_id, 'workspace', ws.name, 'wallet', w.name,
        'from_wallet', src.name, 'from_bank', upper(nullif(src.icon, '')), 'suffix', v_suffix,
        'amount', amount, 'currency', v_cur, 'bank', v_bank, 'posted_at', posted);
    end if;
  end if;

  category_id := coalesce(
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'sales' limit 1),
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'other_income' limit 1));

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by, bank_ref)
  values (ws.id, w.id, category_id, amount, v_cur::public.currency_code, 'INCOME',
          case when v_cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end,
          left('KHQR ពី ' || coalesce(payer, '—') || ' (Ref: ' || v_ref || ')', 500), posted, p_uid, left(v_ref, 64))
  returning id into tx_id;
  insert into public.khqr_payments (workspace_id, bank, ref, transaction_id, payer) values (ws.id, v_bank, v_ref, tx_id, payer)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok', 'transaction_id', tx_id, 'workspace', ws.name, 'wallet', w.name,
    'amount', amount, 'currency', v_cur, 'bank', v_bank, 'posted_at', posted);
end;
$function$;

CREATE OR REPLACE FUNCTION public.bot_bank_alert(p_key text, p_chat_id bigint, p_alert jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  link record;
  amount numeric := (p_alert ->> 'amount')::numeric;
  cur text := p_alert ->> 'currency';
  dir text := p_alert ->> 'direction';
  suffix text := p_alert ->> 'suffix';
  fp text := p_alert ->> 'fingerprint';
  posted timestamptz;
  w public.wallets_accounts;
  ws public.workspaces;
  elsewhere text;
  existing uuid;
  category_id uuid;
  tx_id uuid;
  note text;
  numbers boolean;
  n int;
  choices jsonb;
  held_id uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if public.bot_tier(link.uid) = 'FREE' then
    return jsonb_build_object('status', 'plan_required');
  end if;
  if not coalesce(link.enabled, false) then
    return jsonb_build_object('status', 'commands_off');
  end if;
  if amount is null or amount <= 0 or amount >= 1e12 or cur not in ('USD', 'KHR') or dir not in ('IN', 'OUT')
     or suffix !~ '^\d{3,4}$' or coalesce(fp, '') !~ '^[a-f0-9]{16,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform public.bot_act_as(link.uid);

  -- The same alert twice is the same transaction.
  select transaction_id into existing from public.bank_alerts where user_id = link.uid and fingerprint = fp;
  if found then
    return jsonb_build_object('status', 'duplicate', 'transaction_id', existing);
  end if;

  -- The wallet whose name carries the account's last digits ("ACLEDA ••6222"), in a workspace this chat may log into.
  -- Two or more such wallets: the alert is HELD and the person picks — never a guess (founder, 14/10/2026).
  select count(*), jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'workspace', c.ws_name, 'currency', c.currency) order by c.ord) filter (where c.ord <= 8)
  into n, choices
  from (select x.id, x.name, x.currency, ws2.name as ws_name, row_number() over (order by (x.currency::text = cur) desc, x.created_at) as ord
        from public.wallets_accounts x join public.workspaces ws2 on ws2.id = x.workspace_id
        where x.archived_at is null and (x.name ~ ('(^|\D)' || suffix || '(\D|$)') or regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g') like ('%' || suffix))
          and (x.visibility <> 'PERSONAL' or x.owner_id = link.uid)
          and public.bot_ws_allowed(link.uid, link.ws, link.route_all, x.workspace_id)) c;
  if nullif(p_alert ->> 'wallet_id', '') is not null then
    if not exists (select 1 from jsonb_array_elements(coalesce(choices, '[]'::jsonb)) e where e ->> 'id' = p_alert ->> 'wallet_id') then
      return jsonb_build_object('status', 'invalid');
    end if;
    select x.* into w from public.wallets_accounts x where x.id::text = p_alert ->> 'wallet_id';
  elsif n > 1 then
    insert into public.bot_held_payments (kind, user_id, chat_id, dedup, payload, choices)
    values ('BANK_ALERT', link.uid, p_chat_id, link.uid::text || ':' || fp, p_alert, choices)
    on conflict (kind, dedup) do update set choices = excluded.choices, chat_id = excluded.chat_id
    returning id into held_id;
    return jsonb_build_object('status', 'ambiguous', 'held_id', held_id, 'choices', choices, 'suffix', suffix,
      'count', n, 'amount', amount, 'currency', cur, 'type', case when dir = 'IN' then 'INCOME' else 'EXPENSE' end);
  elsif n = 1 then
    select x.* into w from public.wallets_accounts x where x.id::text = choices -> 0 ->> 'id';
  end if;
  if w.id is null then
    select ws2.name into elsewhere from public.wallets_accounts x join public.workspaces ws2 on ws2.id = x.workspace_id
    where x.archived_at is null and (x.name ~ ('(^|\D)' || suffix || '(\D|$)') or regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g') like ('%' || suffix)) and public.can_write_workspace(x.workspace_id)
    limit 1;
    return jsonb_build_object('status', case when elsewhere is null then 'no_wallet' else 'other_workspace' end, 'workspace', elsewhere, 'suffix', suffix);
  end if;
  select * into ws from public.workspaces where id = w.workspace_id;

  category_id := (
    select c.id from public.categories c
    where c.workspace_id = ws.id and c.type = case when dir = 'IN' then 'INCOME'::public.category_type else 'EXPENSE'::public.category_type end
      and c.preset_key = case when dir = 'OUT' then 'other_expense' when ws.type = 'BUSINESS' then 'sales' else 'other_income' end
    limit 1);
  begin
    posted := (p_alert ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;
  note := left(concat_ws(' · ',
            case when p_alert ->> 'kind' = 'KHQR' then 'KHQR' end,
            nullif(btrim(coalesce(p_alert ->> 'party', '')), ''),
            case when nullif(p_alert ->> 'ref', '') is not null then 'Ref ' || (p_alert ->> 'ref') end), 500);

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
  values (ws.id, w.id, category_id, round(amount, case when cur = 'KHR' then 0 else 2 end), cur::public.currency_code,
          case when dir = 'IN' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
          case when cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end, nullif(note, ''), posted, link.uid)
  returning id into tx_id;
  insert into public.bank_alerts (user_id, fingerprint, transaction_id) values (link.uid, fp, tx_id);

  select t.ai_numbers into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  return jsonb_build_object(
    'status', 'ok', 'transaction_id', tx_id, 'wallet', w.name, 'workspace', ws.name, 'workspace_type', ws.type,
    'type', case when dir = 'IN' then 'INCOME' else 'EXPENSE' end, 'amount', amount, 'currency', cur, 'note', note,
    'balance', case when coalesce(numbers, false) then (select balance from public.wallets_accounts where id = w.id) end,
    'wallet_currency', w.currency
  );
end;
$function$;

-- A tap on a held payment's wallet button (private chat). p_idx is the button's place in the stored choices,
-- so a forged callback can only pick a wallet that was offered. KHQR: the tapping person must be able to write
-- the business. Bank alert: only the chat that sent it.
create or replace function public.bot_held_book(p_key text, p_chat_id bigint, p_held uuid, p_idx int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  h public.bot_held_payments;
  wallet_id text;
  result jsonb;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into h from public.bot_held_payments where id = p_held for update;
  if h.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  if h.booked_at is not null then
    return jsonb_build_object('status', 'already', 'kind', h.kind);
  end if;
  wallet_id := h.choices -> p_idx ->> 'id';
  if wallet_id is null or p_idx < 0 then
    return jsonb_build_object('status', 'invalid');
  end if;

  if h.kind = 'KHQR' then
    perform public.bot_act_as(link.uid);
    if not public.can_write_workspace(h.workspace_id) then
      return jsonb_build_object('status', 'not_writable');
    end if;
    result := public.khqr_record(h.workspace_id, link.uid, h.payload || jsonb_build_object('wallet_id', wallet_id));
  else
    if h.chat_id is distinct from p_chat_id then
      return jsonb_build_object('status', 'not_writable');
    end if;
    result := public.bot_bank_alert(p_key, p_chat_id, h.payload || jsonb_build_object('wallet_id', wallet_id));
  end if;

  if result ->> 'status' in ('ok', 'transfer', 'duplicate') then
    update public.bot_held_payments set booked_at = now(), transaction_id = nullif(result ->> 'transaction_id', '')::uuid where id = h.id;
    if h.kind = 'KHQR' then
      update public.notifications set is_read = true where workspace_id = h.workspace_id and alert_key = 'KHQR_HOLD:' || h.id::text;
    end if;
  end if;
  return result || jsonb_build_object('kind', h.kind, 'workspace_id', h.workspace_id,
    'payer', h.payload ->> 'payer', 'party', h.payload ->> 'party', 'suffix', h.payload ->> 'suffix');
end;
$$;
revoke all on function public.bot_held_book(text, bigint, uuid, int) from public, anon, authenticated;
grant execute on function public.bot_held_book(text, bigint, uuid, int) to anon, authenticated;
