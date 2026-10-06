-- 1. Delete my account (store compliance): everything the person owns goes —
--    their workspaces (wallets, entries, debts…), profile, links and the
--    sign-in itself. Needs the password typed in the last 5 minutes (the
--    "amr" time in the session token, which a token refresh doesn't renew).
-- 2. Password reset through Telegram (free): a 6-digit code to the linked
--    chat; an unlinked PHONE account proves the number by sharing its
--    Telegram contact (Telegram verifies it). Codes are hashed, 10 minutes,
--    5 tries; a verified code gives a 10-minute grant to set the password.
--    The server (bot key) creates and sends codes; the app never sees one.

-- ---------------------------------------------------------------------------
-- 1. Delete my account
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fresh boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'confirm_required' using errcode = '22023';
  end if;
  -- Staff accounts are removed from the staff list first (by a super admin).
  if public.is_staff_user(uid) then
    raise exception 'staff_account' using errcode = '42501';
  end if;
  -- The password (or a one-time code) entered within the last 5 minutes.
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300
  ) into fresh;
  if not fresh then
    raise exception 'reauth_required' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  -- A family workspace with other members would vanish for them too.
  if exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id and m.user_id <> uid
    where w.user_id = uid
  ) then
    raise exception 'shared_workspaces' using errcode = '22023';
  end if;

  perform public.audit('ACCOUNT_SELF_DELETED', null, null, null, uid);
  -- In an order the foreign keys accept: repayments point at wallets without a
  -- cascade, so they go first, then the ledger, then the workspaces (which
  -- cascade to wallets, debts, budgets…), then the sign-in itself.
  delete from public.debt_repayments r using public.debts d, public.workspaces w
  where r.debt_id = d.id and d.workspace_id = w.id and w.user_id = uid;
  delete from public.transactions t using public.workspaces w where t.workspace_id = w.id and w.user_id = uid;
  delete from public.workspaces where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Password reset through Telegram
-- ---------------------------------------------------------------------------
create table if not exists public.password_resets (
  id              uuid primary key default gen_random_uuid(),
  -- Null when the address / number has no account (the answer looks the same).
  user_id         uuid references auth.users (id) on delete cascade,
  link_token      text not null unique,
  chat_id         bigint,
  code_hash       text,
  code_expires_at timestamptz,
  attempts        integer not null default 0,
  grant_hash      text,
  grant_expires_at timestamptz,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists password_resets_user_idx on public.password_resets (user_id, created_at);
create index if not exists password_resets_chat_idx on public.password_resets (chat_id, created_at);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;

create or replace function public.reset_hash(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function public.reset_hash(text) from public, anon, authenticated;

-- A uniformly random 6-digit code (rejection sampling: no modulo bias).
create or replace function public.reset_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint;
begin
  loop
    n := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
    exit when n < 4294000000; -- a multiple of 1,000,000
  end loop;
  return lpad((n % 1000000)::text, 6, '0');
end;
$$;
revoke all on function public.reset_new_code() from public, anon, authenticated;

-- Server (bot key): start a reset for an address (phone accounts as their
-- internal address). Returns the code and chat to send it to when Telegram is
-- linked, and always a link token (for the deep link) — same shape either way.
create or replace function public.bot_reset_start(p_key text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  link record;
  token text := encode(extensions.gen_random_bytes(16), 'hex');
  code text;
  recent integer;
begin
  perform public.require_bot(p_key);
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is not null then
    select count(*) into recent from public.password_resets where user_id = uid and created_at > now() - interval '15 minutes';
    if recent >= 3 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    select l.chat_id, l.language into link from public.telegram_links l where l.user_id = uid;
  end if;
  if uid is not null and link.chat_id is not null then
    code := public.reset_new_code();
    insert into public.password_resets (user_id, link_token, chat_id, code_hash, code_expires_at)
    values (uid, token, link.chat_id, public.reset_hash(code), now() + interval '10 minutes');
    return jsonb_build_object('status', 'ok', 'link_token', token, 'chat_id', link.chat_id, 'language', link.language, 'code', code);
  end if;
  insert into public.password_resets (user_id, link_token) values (uid, token);
  return jsonb_build_object('status', 'ok', 'link_token', token);
end;
$$;

-- Server (bot key): /start reset_<token> in a chat — remember which chat asked.
create or replace function public.bot_reset_bind(p_key text, p_token text, p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.password_resets;
begin
  perform public.require_bot(p_key);
  select * into r from public.password_resets
  where link_token = p_token and used_at is null and created_at > now() - interval '30 minutes';
  if not found then
    return 'expired';
  end if;
  update public.password_resets set chat_id = p_chat_id where id = r.id;
  -- Only a phone account can be proven by sharing the Telegram contact.
  return case when r.user_id is not null and public.phone_login_number((select email from auth.users where id = r.user_id)) is not null then 'phone' else 'other' end;
end;
$$;

-- Server (bot key): the chat shared its own Telegram contact. When the number
-- is the account's, a code goes to this chat. Null when it doesn't match.
create or replace function public.bot_reset_contact(p_key text, p_chat_id bigint, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.password_resets;
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  local text;
  code text;
begin
  perform public.require_bot(p_key);
  select * into r from public.password_resets
  where chat_id = p_chat_id and used_at is null and code_hash is null and user_id is not null
    and created_at > now() - interval '30 minutes'
  order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  -- +855 12 345 678 / 85512345678 / 012345678 → 012345678
  local := case when digits like '855%' then '0' || substr(digits, 4) when digits like '0%' then digits else '0' || digits end;
  if local is distinct from public.phone_login_number((select email from auth.users where id = r.user_id)) then
    return jsonb_build_object('status', 'mismatch');
  end if;
  code := public.reset_new_code();
  update public.password_resets set code_hash = public.reset_hash(code), code_expires_at = now() + interval '10 minutes', attempts = 0 where id = r.id;
  return jsonb_build_object('status', 'ok', 'code', code);
end;
$$;

-- App (anyone): the code typed in → a 10-minute grant to set the password.
-- 5 tries per code. Returns null for every failure (no exception: an
-- exception would also roll back the counted try, making the limit useless).
create or replace function public.reset_verify_code(p_email text, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  r public.password_resets;
  grant_token text;
begin
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return null;
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    return null;
  end if;
  select * into r from public.password_resets
  where user_id = uid and code_hash is not null and used_at is null and code_expires_at > now()
  order by created_at desc limit 1
  for update;
  if not found then
    return null;
  end if;
  if r.attempts >= 5 then
    update public.password_resets set code_hash = null where id = r.id;
    return null;
  end if;
  if r.code_hash <> public.reset_hash(p_code) then
    update public.password_resets set attempts = attempts + 1 where id = r.id;
    return null;
  end if;
  grant_token := encode(extensions.gen_random_bytes(24), 'hex');
  update public.password_resets
  set code_hash = null, grant_hash = public.reset_hash(grant_token), grant_expires_at = now() + interval '10 minutes'
  where id = r.id;
  return grant_token;
end;
$$;

-- App (anyone holding a grant): the new password. Every session of the
-- account ends (signed out everywhere).
create or replace function public.reset_set_password(p_grant text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.password_resets;
begin
  if coalesce(length(p_password), 0) < 6 or length(p_password) > 72 then
    raise exception 'weak_password' using errcode = '22023';
  end if;
  select * into r from public.password_resets
  where grant_hash = public.reset_hash(coalesce(p_grant, '')) and used_at is null and grant_expires_at > now()
  for update;
  if not found then
    raise exception 'invalid_grant' using errcode = '22023';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = r.user_id;
  delete from auth.sessions where user_id = r.user_id;
  update public.password_resets set used_at = now(), grant_hash = null where id = r.id;
  -- Older unfinished requests of this account can't be used any more either.
  update public.password_resets set used_at = now() where user_id = r.user_id and used_at is null;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_reset_start(text, text)',
    'public.bot_reset_bind(text, text, bigint)',
    'public.bot_reset_contact(text, bigint, text)',
    'public.reset_verify_code(text, text)',
    'public.reset_set_password(text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
