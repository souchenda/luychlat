-- KHQR: the receiving bank by the payment's reference, not the label it came with.
-- A customer paying the ACLEDA stand from their ABA app is pushed as bank "ABA" (the
-- payer's bank); since wallets match by bank, it would land in the ABA wallet.
-- References as seen on 2026-10-07 (21 payments):
--   ABA PayWay Trx. ID — 15 digits (179138444741602)
--   ACLEDA            — 11-digit Ref.ID (62805162156) or an 8-hex hash (fe830877)
-- The label changes only when the reference clearly says otherwise.

create or replace function public.khqr_receiving_bank(p_bank text, p_ref text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_bank = 'ABA' and (p_ref ~ '^[0-9a-f]{6,12}$' and p_ref ~ '[a-f]' or p_ref ~ '^[0-9]{6,12}$') then 'ACLEDA'
    when p_bank = 'ACLEDA' and p_ref ~ '^[0-9]{14,20}$' then 'ABA'
    else p_bank
  end
$$;
revoke all on function public.khqr_receiving_bank(text, text) from public, anon, authenticated;

create or replace function public.khqr_record(p_ws uuid, p_uid uuid, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- The bank's wallet in this currency, else any wallet of that bank, else one in the currency, else the first.
  -- A wallet is the bank's by the bank picked for it (icon 'aba' / 'acleda') or by its name.
  bank_re := case when v_bank = 'ACLEDA' then '(acleda|អេស៊ីលីដា)' else '(^|[^a-z])aba([^a-z]|$)' end;
  select x.* into w from public.wallets_accounts x
  where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
  order by ((lower(coalesce(x.icon, '')) = lower(v_bank) or lower(x.name) ~ bank_re) and x.currency::text = v_cur) desc,
           (lower(coalesce(x.icon, '')) = lower(v_bank) or lower(x.name) ~ bank_re) desc,
           (x.currency::text = v_cur) desc, x.created_at
  limit 1;
  if w.id is null then
    return jsonb_build_object('status', 'no_wallet', 'workspace', ws.name);
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
$$;
revoke all on function public.khqr_record(uuid, uuid, jsonb) from public, anon, authenticated;

select public.apply_security_gate();
