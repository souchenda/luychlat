-- KHQR ingest API: a merchant's own tool (e.g. AUTOBOK, which already reads the
-- banks' payment messages) pushes each payment to LuyChlat over HTTPS:
--   POST /api/khqr/ingest   Authorization: Bearer lck_…
-- A key belongs to one BUSINESS workspace; only its SHA-256 is stored. Payments
-- are saved exactly like the Telegram group listener (Sales income, the bank's
-- wallet in that currency, once per bank ref) — both now share khqr_record().

create table if not exists public.khqr_api_keys (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  key_hash     text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
  key_hint     text not null,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.khqr_api_keys enable row level security;
revoke all on public.khqr_api_keys from anon, authenticated;

-- Internal: save one payment into a business workspace as user p_uid. Not callable by clients.
-- p_pay: {"bank": "ACLEDA"|"ABA", "amount": 1, "currency": "USD"|"KHR", "payer": "…", "ref": "…", "posted_at": "…"}
create or replace function public.khqr_record(p_ws uuid, p_uid uuid, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
  w public.wallets_accounts;
  v_bank text := upper(btrim(coalesce(p_pay ->> 'bank', '')));
  amount numeric;
  v_cur text := upper(btrim(coalesce(p_pay ->> 'currency', '')));
  v_ref text := lower(btrim(coalesce(p_pay ->> 'ref', '')));
  payer text := left(nullif(btrim(coalesce(p_pay ->> 'payer', '')), ''), 80);
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
  bank_re := case when v_bank = 'ACLEDA' then '(acleda|អេស៊ីលីដា)' else '(^|[^a-z])aba([^a-z]|$)' end;
  select x.* into w from public.wallets_accounts x
  where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
  order by (lower(x.name) ~ bank_re and x.currency::text = v_cur) desc, (lower(x.name) ~ bank_re) desc, (x.currency::text = v_cur) desc, x.created_at
  limit 1;
  if w.id is null then
    return jsonb_build_object('status', 'no_wallet', 'workspace', ws.name);
  end if;

  category_id := coalesce(
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'sales' limit 1),
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'other_income' limit 1));
  begin
    posted := (p_pay ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by, bank_ref)
  values (ws.id, w.id, category_id, round(amount, case when v_cur = 'KHR' then 0 else 2 end), v_cur::public.currency_code, 'INCOME',
          case when v_cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end,
          left('KHQR ពី ' || coalesce(payer, '—') || ' (Ref: ' || v_ref || ')', 500), posted, p_uid, left(v_ref, 64))
  returning id into tx_id;
  insert into public.khqr_payments (workspace_id, bank, ref, transaction_id) values (ws.id, v_bank, v_ref, tx_id)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok', 'transaction_id', tx_id, 'workspace', ws.name, 'wallet', w.name,
    'amount', round(amount, case when v_cur = 'KHR' then 0 else 2 end), 'currency', v_cur, 'bank', v_bank,
    'posted_at', posted);
end;
$$;
revoke all on function public.khqr_record(uuid, uuid, jsonb) from public, anon, authenticated;

-- The Telegram group listener, now through khqr_record (same result as before).
create or replace function public.bot_khqr_sale(p_key text, p_group bigint, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.biz_groups;
begin
  perform public.require_bot(p_key);
  select * into g from public.biz_groups where chat_id = p_group;
  if g.chat_id is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  return public.khqr_record(g.workspace_id, g.linked_by, p_pay);
end;
$$;

-- Server (the /api/khqr/ingest route, with the bot key): a payment pushed with an API key.
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
  return result || jsonb_build_object('workspace_id', k.workspace_id);
end;
$$;

-- Server: the Telegram groups linked to a workspace (to post "✅ … បានកត់ត្រា" there when asked).
create or replace function public.bot_biz_groups_of(p_key text, p_workspace_id uuid)
returns table (chat_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query select g.chat_id from public.biz_groups g where g.workspace_id = p_workspace_id;
end;
$$;

-- App (the business owner): a new API key — shown once; any previous key stops working.
create or replace function public.khqr_api_key_create(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
  plain text := 'lck_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  select * into ws from public.workspaces where id = p_workspace_id;
  if ws.id is null or ws.type <> 'BUSINESS' or ws.user_id is distinct from (select auth.uid()) or not public.can_write_workspace(ws.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.biz_group_allowed((select auth.uid())) then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  insert into public.khqr_api_keys (workspace_id, key_hash, key_hint, created_by)
  values (ws.id, encode(sha256(convert_to(plain, 'UTF8')), 'hex'), right(plain, 4), (select auth.uid()))
  on conflict (workspace_id) do update set key_hash = excluded.key_hash, key_hint = excluded.key_hint, created_by = excluded.created_by,
    created_at = now(), last_used_at = null;
  return plain;
end;
$$;

-- App: whether a key exists (its last 4 characters and last use), and revoking it.
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
  return (select jsonb_build_object('hint', k.key_hint, 'created_at', k.created_at, 'last_used_at', k.last_used_at)
            from public.khqr_api_keys k where k.workspace_id = p_workspace_id);
end;
$$;

create or replace function public.khqr_api_key_revoke(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.khqr_api_keys where workspace_id = p_workspace_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_khqr_sale(text, bigint, jsonb)',
    'public.bot_khqr_ingest(text, text, jsonb)',
    'public.bot_biz_groups_of(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.khqr_api_key_create(uuid)',
    'public.khqr_api_key_info(uuid)',
    'public.khqr_api_key_revoke(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
