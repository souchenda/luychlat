-- KHQR: the owner moving money between their own accounts is a TRANSFER, not a sale.
-- "៛21,600,000 paid by Sou Chenda (*262) … via ABA KHQR (ACLEDA Bank Plc.) at SOU CHENDA":
-- the payer's account ends in 262 = the workspace's wallet "ACLEDA 386***6262", and the
-- payer is the owner. Then khqr_record() books ACLEDA *262 → the bank's wallet as a
-- transfer (no Sales income).
--
-- Both must hold — a 3-digit suffix alone is shared by about 1 customer in 1,000:
--   1. the suffix matches exactly one other wallet (same currency) — by its account
--      number, else the last digits in its name ("ACLEDA 386***6262");
--   2. the payer is the owner: the receiver / merchant name when the message has one
--      ("at SOU CHENDA"), or a payer already confirmed as an own transfer in this
--      workspace (khqr_payments.payer on a TRANSFER).
-- The bank already moved the money, so the source wallet's app balance may go below
-- zero (its balance in the app was behind) — that is shown, not refused.

alter table public.khqr_payments add column if not exists payer text;

-- Payers of the payments already recorded (from the note "KHQR ពី NAME (*262) (Ref: …)").
update public.khqr_payments k
set payer = left(btrim(substring(t.note from 'KHQR ពី (.*) \(Ref: ')), 80)
from public.transactions t
where t.id = k.transaction_id and k.payer is null and t.note like '%KHQR ពី %';

-- "Sou Chenda (*262)" / "071***7098 SOU CHENDA" → "SOU CHENDA".
create or replace function public.khqr_payer_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    '\(\s*\*+\s*\d+\s*\)', '', 'g'),     -- (*262)
    '\d*[*x•]+\d+', '', 'g'),            -- 071***7098
    '\s+', ' ', 'g'))), '')
$$;

-- "Sou Chenda (*262)" → "262"; "071***7098 NAME" → "7098".
create or replace function public.khqr_payer_suffix(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(substring(coalesce(p, '') from '\(\s*\*+\s*(\d{3,})\s*\)'), substring(coalesce(p, '') from '\d*[*x•]+(\d{3,})'))
$$;

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
revoke all on function public.khqr_payer_name(text) from public, anon, authenticated;
revoke all on function public.khqr_payer_suffix(text) from public, anon, authenticated;

select public.apply_security_gate();
