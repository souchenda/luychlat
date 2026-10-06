-- Business KHQR groups: a merchant's Telegram group where the banks' notifier
-- bots post KHQR payments (ACLEDA "Received 1.00 USD from …", ABA PayWay
-- "៛1,900,000 paid by …"). Linked to a BUSINESS workspace, each payment is saved
-- once as Sales income (the bank's ref is the idempotency key).
--
-- Linking: the owner gets a 6-character code in the app (Settings › Telegram)
-- and sends /biz link CODE in the group. Paid plans only (super admins exempt).

create table if not exists public.biz_groups (
  chat_id      bigint primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  linked_by    uuid not null references auth.users (id) on delete cascade,
  title        text,
  linked_at    timestamptz not null default now()
);
create index if not exists biz_groups_workspace_idx on public.biz_groups (workspace_id);
alter table public.biz_groups enable row level security;
revoke all on public.biz_groups from anon, authenticated;

create table if not exists public.biz_link_codes (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  code         text not null,
  created_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null
);
alter table public.biz_link_codes enable row level security;
revoke all on public.biz_link_codes from anon, authenticated;

-- One row per bank payment and workspace: retries and repeated posts never double-count.
create table if not exists public.khqr_payments (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  bank           text not null check (bank in ('ACLEDA', 'ABA')),
  ref            text not null check (char_length(ref) between 4 and 64),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (workspace_id, bank, ref)
);
alter table public.khqr_payments enable row level security;
revoke all on public.khqr_payments from anon, authenticated;

-- Is this user's account on a paid plan, or a super admin?
create or replace function public.biz_group_allowed(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_code_of(p_uid) <> 'FREE'
      or exists (select 1 from public.app_admins a where a.user_id = p_uid and a.role = 'super_admin');
$$;
revoke all on function public.biz_group_allowed(uuid) from public, anon, authenticated;

-- App: a fresh link code for a business workspace (its owner only), valid 30 minutes.
create or replace function public.biz_telegram_code(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
  code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  select * into ws from public.workspaces where id = p_workspace_id;
  if ws.id is null or ws.type <> 'BUSINESS' or ws.user_id is distinct from (select auth.uid()) or not public.can_write_workspace(ws.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.biz_group_allowed((select auth.uid())) then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  insert into public.biz_link_codes (workspace_id, code, created_by, expires_at)
  values (ws.id, code, (select auth.uid()), now() + interval '30 minutes')
  on conflict (workspace_id) do update set code = excluded.code, created_by = excluded.created_by, expires_at = excluded.expires_at;
  return code;
end;
$$;

-- App: the groups linked to a business workspace (members of the workspace may see them).
create or replace function public.biz_telegram_groups(p_workspace_id uuid)
returns table (chat_id bigint, title text, linked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select g.chat_id, g.title, g.linked_at from public.biz_groups g where g.workspace_id = p_workspace_id order by g.linked_at;
end;
$$;

-- App: unlink a group (the workspace's owner).
create or replace function public.biz_telegram_unlink(p_workspace_id uuid, p_chat_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.biz_groups where workspace_id = p_workspace_id and chat_id = p_chat_id;
end;
$$;

-- Bot: /biz link CODE in a group, sent by the owner's linked Telegram account.
create or replace function public.bot_biz_link(p_key text, p_group bigint, p_from bigint, p_code text, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  c public.biz_link_codes;
  ws public.workspaces;
begin
  perform public.require_bot(p_key);
  uid := public.bot_user_of(p_from);
  if uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into c from public.biz_link_codes
  where code = upper(btrim(coalesce(p_code, ''))) and expires_at > now() and created_by = uid
  for update;
  if c.workspace_id is null then
    return jsonb_build_object('status', 'bad_code');
  end if;
  select * into ws from public.workspaces where id = c.workspace_id;
  if ws.type <> 'BUSINESS' then
    return jsonb_build_object('status', 'bad_code');
  end if;
  if not public.biz_group_allowed(uid) then
    return jsonb_build_object('status', 'plan_required');
  end if;
  insert into public.biz_groups (chat_id, workspace_id, linked_by, title)
  values (p_group, ws.id, uid, left(nullif(btrim(coalesce(p_title, '')), ''), 120))
  on conflict (chat_id) do update set workspace_id = excluded.workspace_id, linked_by = excluded.linked_by, title = excluded.title, linked_at = now();
  delete from public.biz_link_codes where workspace_id = ws.id;
  update public.telegram_groups set unlinked_since = null where chat_id = p_group;
  return jsonb_build_object('status', 'ok', 'workspace', ws.name);
end;
$$;

-- Bot: /biz in a group — which workspace it records into.
create or replace function public.bot_biz_group(p_key text, p_group bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  name text;
begin
  perform public.require_bot(p_key);
  select w.name into name from public.biz_groups g join public.workspaces w on w.id = g.workspace_id where g.chat_id = p_group;
  return case when name is null then null else jsonb_build_object('workspace', name) end;
end;
$$;

-- Bot: a KHQR payment posted in a linked group → Sales income, once per bank ref.
-- p_pay: {"bank": "ACLEDA"|"ABA", "amount": 1, "currency": "USD"|"KHR", "payer": "…",
--         "ref": "f74f2977", "posted_at": "2026-10-06T20:20:00+07:00"}
create or replace function public.bot_khqr_sale(p_key text, p_group bigint, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.biz_groups;
  ws public.workspaces;
  w public.wallets_accounts;
  v_bank text := p_pay ->> 'bank';
  amount numeric;
  v_cur text := p_pay ->> 'currency';
  v_ref text := lower(btrim(coalesce(p_pay ->> 'ref', '')));
  payer text := left(nullif(btrim(coalesce(p_pay ->> 'payer', '')), ''), 80);
  posted timestamptz;
  category_id uuid;
  tx_id uuid;
  bank_re text;
begin
  perform public.require_bot(p_key);
  select * into g from public.biz_groups where chat_id = p_group;
  if g.chat_id is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if not public.biz_group_allowed(g.linked_by) then
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
  select * into ws from public.workspaces where id = g.workspace_id;
  perform public.bot_act_as(g.linked_by);
  if not public.can_write_workspace(ws.id) then
    return jsonb_build_object('status', 'not_writable');
  end if;

  -- Already recorded (a retry, or the same payment posted twice).
  if exists (select 1 from public.khqr_payments k where k.workspace_id = ws.id and k.bank = v_bank and k.ref = v_ref) then
    return jsonb_build_object('status', 'duplicate');
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
          left('KHQR ពី ' || coalesce(payer, '—') || ' (Ref: ' || v_ref || ')', 500), posted, g.linked_by, left(v_ref, 64))
  returning id into tx_id;
  insert into public.khqr_payments (workspace_id, bank, ref, transaction_id) values (ws.id, v_bank, v_ref, tx_id)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok', 'workspace', ws.name, 'wallet', w.name, 'amount', amount, 'currency', v_cur, 'bank', v_bank);
end;
$$;

-- Groups linked to a business workspace stay (the 10-minute sweep keeps them).
create or replace function public.bot_group_sweep(p_key text)
returns table (chat_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.telegram_groups g set unlinked_since = null
   where g.unlinked_since is not null
     and (exists (select 1 from public.pools p where p.tg_chat_id = g.chat_id and p.status = 'active')
          or exists (select 1 from public.biz_groups b where b.chat_id = g.chat_id));
  update public.telegram_groups g set unlinked_since = now()
   where g.unlinked_since is null
     and not exists (select 1 from public.pools p where p.tg_chat_id = g.chat_id and p.status = 'active')
     and not exists (select 1 from public.biz_groups b where b.chat_id = g.chat_id);
  return query
    select g.chat_id from public.telegram_groups g
     where g.unlinked_since < now() - interval '10 minutes'
     order by g.unlinked_since
     limit 20;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_biz_link(text, bigint, bigint, text, text)',
    'public.bot_biz_group(text, bigint)',
    'public.bot_khqr_sale(text, bigint, jsonb)',
    'public.bot_group_sweep(text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.biz_telegram_code(uuid)',
    'public.biz_telegram_groups(uuid)',
    'public.biz_telegram_unlink(uuid, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
