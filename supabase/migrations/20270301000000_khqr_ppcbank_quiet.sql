-- KHQR: PPCBank, and «record only» businesses (founder, 8/11/2026 — the shop «ហាងឆ្លាត» takes KHQR at PPCBank).
--   1. khqr_record accepts PPCBANK (AUTOBOK sends «PPCBank»). Its wallet is the one whose bank is PPCBank (icon
--      'ppcbank') or whose name says so; none → held and the owner asked, as for ABA / ACLEDA. Its 9-digit Ref No
--      keeps the label (khqr_receiving_bank only swaps ABA ↔ ACLEDA).
--   2. workspaces.khqr_quiet: the business's own device already announces each payment, so App Luy Chlat only
--      records it — no private message, no SoundBox, no voice, no push (one announcer, never two). A held
--      payment is still asked: the money must never be booked by a guess.

alter table public.workspaces add column if not exists khqr_quiet boolean not null default false;

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
  if v_bank in ('PPCB', 'PPC BANK', 'PPC') then v_bank := 'PPCBANK'; end if;
  if v_bank not in ('ACLEDA', 'ABA', 'PPCBANK') or amount is null or amount <= 0 or amount >= 1e12 or v_cur not in ('USD', 'KHR') or v_ref !~ '^[a-z0-9]{4,64}$' then
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
  bank_re := case when v_bank = 'ACLEDA' then '(acleda|អេស៊ីលីដា)'
                 when v_bank = 'PPCBANK' then '(ppc\s*bank|(^|[^a-z])ppcb([^a-z]|$)|phnom penh commercial|ភីភីស៊ីប៊ី)'
                 else '(^|[^a-z])aba([^a-z]|$)' end;
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
revoke all on function public.khqr_record(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.bot_khqr_ingest(p_key text, p_key_hash text, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.khqr_api_keys;
  result jsonb;
begin
  perform public.require_bot(p_key);
  select * into k from public.khqr_api_keys where key_hash = lower(coalesce(p_key_hash, ''));
  if k.workspace_id is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  -- The key acts as the business owner (who made it); suspended / removed owners stop working.
  if not exists (select 1 from public.workspaces w where w.id = k.workspace_id and w.user_id = k.created_by)
     or exists (select 1 from public.account_controls c where c.user_id = k.created_by and c.suspended_at is not null) then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  update public.khqr_api_keys set last_used_at = now() where workspace_id = k.workspace_id;
  result := public.khqr_record(k.workspace_id, k.created_by, p_pay);
  return result || jsonb_build_object('workspace_id', k.workspace_id,
    'quiet', coalesce((select w.khqr_quiet from public.workspaces w where w.id = k.workspace_id), false));
end;
$$;

-- App: the key's state, and whether the business is «record only».
create or replace function public.khqr_api_key_info(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select jsonb_build_object('hint', k.key_hint, 'created_at', k.created_at, 'last_used_at', k.last_used_at, 'quiet', w.khqr_quiet)
            from public.khqr_api_keys k join public.workspaces w on w.id = k.workspace_id where k.workspace_id = p_workspace_id);
end;
$$;

-- App (the business owner): «record only» on / off.
create or replace function public.khqr_set_quiet(p_workspace_id uuid, p_quiet boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.type = 'BUSINESS' and w.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.workspaces set khqr_quiet = coalesce(p_quiet, false) where id = p_workspace_id;
end;
$$;
revoke all on function public.khqr_set_quiet(uuid, boolean) from public, anon;
grant execute on function public.khqr_set_quiet(uuid, boolean) to authenticated;
