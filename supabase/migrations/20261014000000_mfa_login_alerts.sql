-- Two-factor authentication (Supabase MFA / TOTP) enforced in the database,
-- an admin "reset 2FA" for account recovery, and Telegram alerts for new
-- sign-ins. Idempotent.

-- ---------------------------------------------------------------------------
-- Security events (sign-ins, 2FA resets): the user reads their own.
-- ---------------------------------------------------------------------------
create table if not exists public.security_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('LOGIN', 'MFA_RESET')),
  session_id  uuid,
  user_agent  text,
  ip          text,
  actor       uuid references auth.users (id) on delete set null,
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create unique index if not exists security_events_login_once on public.security_events (user_id, session_id) where kind = 'LOGIN';
create index if not exists security_events_user_idx on public.security_events (user_id, created_at desc);
alter table public.security_events enable row level security;
drop policy if exists security_events_select_own on public.security_events;
create policy security_events_select_own on public.security_events
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.security_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2FA gate: a user with a verified authenticator must be signed in at aal2
-- (password/Google + 6-digit code). Users without 2FA are unaffected.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('auth.mfa_factors', 'select') then
    execute $f$
      create or replace function public.mfa_ok()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
            or not exists (
              select 1 from auth.mfa_factors f
              where f.user_id = (select auth.uid()) and f.status = 'verified'
            );
      $body$
    $f$;
  else
    raise warning 'auth.mfa_factors is not readable: 2FA is not enforced in the database';
    execute $f$
      create or replace function public.mfa_ok()
      returns boolean
      language sql
      stable
      set search_path = ''
      as $body$ select true $body$
    $f$;
  end if;
end $$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- Live session and, when 2FA is on, a verified code.
create or replace function public.access_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_alive() and public.mfa_ok();
$$;
revoke all on function public.access_ok() from public, anon;
grant execute on function public.access_ok() to authenticated;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.access_ok() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_write_workspace(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.access_ok() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()) and m.role in ('OWNER', 'MEMBER')
  ) and (public.workspace_plan_access(ws_id)).writable;
$$;

-- Every table with RLS also gets a restrictive policy, so own-only tables
-- (profiles, settings, payments…) are covered too. (select …) makes it run
-- once per query, not per row. Later migrations that add tables end with
-- "select public.apply_security_gate();".
create or replace function public.apply_security_gate()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists security_gate on public.%I', t.relname);
    execute format(
      'create policy security_gate on public.%I as restrictive for all to authenticated using ((select public.access_ok())) with check ((select public.access_ok()))',
      t.relname
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.apply_security_gate() from public, anon, authenticated;
select public.apply_security_gate();

-- Admin tools also require the admin's own 2FA when they have it.
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or not public.access_ok() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: 2FA status and emergency reset (after verifying the person through
-- support). The reset removes the authenticators and signs every device out.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_security(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'mfa', (select count(*) from auth.mfa_factors f where f.user_id = p_user_id and f.status = 'verified'),
    'sessions', (select count(*) from auth.sessions s where s.user_id = p_user_id),
    'last_reset', (select max(created_at) from public.security_events e where e.user_id = p_user_id and e.kind = 'MFA_RESET')
  );
end;
$$;
revoke all on function public.admin_user_security(uuid) from public, anon;
grant execute on function public.admin_user_security(uuid) to authenticated;

create or replace function public.admin_reset_mfa(p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'ask another admin to reset your own 2FA' using errcode = '42501';
  end if;
  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  insert into public.security_events (user_id, kind, actor, note)
  values (p_user_id, 'MFA_RESET', (select auth.uid()), left(nullif(btrim(coalesce(p_note, '')), ''), 300));
end;
$$;
revoke all on function public.admin_reset_mfa(uuid, text) from public, anon;
grant execute on function public.admin_reset_mfa(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- New sign-in alerts on Telegram (the user's own bot from Settings), once per
-- session. Device and IP come from auth.sessions, not from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.record_login(p_user_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  ts record;
  device text;
  inserted integer;
begin
  if p_user_id is null or p_session_id is null then
    return false;
  end if;
  select user_agent, host(ip) as ip into s from auth.sessions where id = p_session_id and user_id = p_user_id;
  if not found then
    return false;
  end if;
  insert into public.security_events (user_id, kind, session_id, user_agent, ip)
  values (p_user_id, 'LOGIN', p_session_id, left(s.user_agent, 400), s.ip)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  select bot_token, chat_id, language into ts from public.telegram_settings where user_id = p_user_id and enabled;
  if found then
    device := case
      when s.user_agent ~ 'iPhone' then 'iPhone'
      when s.user_agent ~ 'iPad' then 'iPad'
      when s.user_agent ~ 'Android' then 'Android'
      when s.user_agent ~ 'Windows' then 'Windows'
      when s.user_agent ~ 'Mac OS X|Macintosh' then 'Mac'
      when s.user_agent ~ 'Linux' then 'Linux'
      else '?'
    end || case
      when s.user_agent ~ 'Edg/' then ' · Edge'
      when s.user_agent ~ 'SamsungBrowser' then ' · Samsung Internet'
      when s.user_agent ~ 'Firefox|FxiOS' then ' · Firefox'
      when s.user_agent ~ 'CriOS|Chrome/' then ' · Chrome'
      when s.user_agent ~ 'Safari/' then ' · Safari'
      else ''
    end;
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || ts.bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', ts.chat_id,
        'parse_mode', 'HTML',
        'text', case when ts.language = 'en' then
            '🔐 <b>New sign-in to your account</b>' || E'\n📱 ' || device || E'\n🌐 IP: ' || coalesce(s.ip, '?')
            || E'\n🕒 ' || to_char(now() at time zone 'Asia/Phnom_Penh', 'DD/MM/YYYY HH24:MI')
            || E'\n\nNot you? Open Settings › Security › Active devices, sign it out and change your password.'
          else
            '🔐 <b>សកម្មភាពចូលថ្មីពីឧបករណ៍ថ្មី</b>' || E'\n📱 ' || device || E'\n🌐 IP: ' || coalesce(s.ip, '?')
            || E'\n🕒 ' || to_char(now() at time zone 'Asia/Phnom_Penh', 'DD/MM/YYYY HH24:MI')
            || E'\n\nមិនមែនអ្នក? ចូល ការកំណត់ › សុវត្ថិភាព › ឧបករណ៍កំពុងដំណើរការ ហើយចាកចេញ រួចប្តូរពាក្យសម្ងាត់។'
          end || E'\n\n— លុយឆ្លាត · LuyChlat'
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return true;
end;
$$;
revoke all on function public.record_login(uuid, uuid) from public, anon, authenticated;

-- Called by the app when it opens (the caller's own current session only).
create or replace function public.note_login()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.record_login((select auth.uid()), nullif(auth.jwt() ->> 'session_id', '')::uuid);
$$;
revoke all on function public.note_login() from public, anon;
grant execute on function public.note_login() to authenticated;

-- Optional Supabase Auth hook (Authentication › Hooks › Customize Access
-- Token → public.custom_access_token_hook): records the sign-in server-side
-- even when the app isn't opened. Claims are returned unchanged.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.record_login((event ->> 'user_id')::uuid, nullif(event -> 'claims' ->> 'session_id', '')::uuid);
  exception when others then
    -- Never block a sign-in because of an alert.
    null;
  end;
  return event;
end;
$$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin';
  end if;
end $$;
