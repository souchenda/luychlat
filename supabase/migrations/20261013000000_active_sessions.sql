-- Active devices: list the caller's sign-in sessions (auth.sessions) and sign
-- them out remotely. A revoked session can't refresh its token, and it loses
-- access to workspace data at once (the membership checks below require the
-- caller's session to still exist). Idempotent.

-- True while the caller's session exists. Tokens without a session id (and
-- the service role) are not affected. If this database role can't read
-- auth.sessions, the check is a no-op rather than breaking every query.
do $$
begin
  if has_table_privilege('auth.sessions', 'select') then
    execute $f$
      create or replace function public.session_alive()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select coalesce(auth.jwt() ->> 'session_id', '') = ''
            or exists (select 1 from auth.sessions s where s.id = (auth.jwt() ->> 'session_id')::uuid);
      $body$
    $f$;
  else
    raise warning 'auth.sessions is not readable: revoked sessions keep access until their token expires';
    execute $f$
      create or replace function public.session_alive()
      returns boolean
      language sql
      stable
      set search_path = ''
      as $body$ select true $body$
    $f$;
  end if;
end $$;
revoke all on function public.session_alive() from public, anon;
grant execute on function public.session_alive() to authenticated;

-- Workspace access (every financial table's RLS) also requires a live session.
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_alive() and exists (
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
  select public.session_alive() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()) and m.role in ('OWNER', 'MEMBER')
  ) and (public.workspace_plan_access(ws_id)).writable;
$$;

-- The caller's sessions, current first, then by last activity.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, aal text, is_current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') as last_active_at,
         s.user_agent,
         host(s.ip) as ip,
         s.aal::text,
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '') as is_current
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
  order by (s.id::text = coalesce(auth.jwt() ->> 'session_id', '')) desc,
           greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') desc;
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- Sign out one of the caller's other sessions.
create or replace function public.revoke_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_session_id::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'use sign out for the current session' using errcode = '22023';
  end if;
  delete from auth.sessions where id = p_session_id and user_id = uid;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.revoke_session(uuid) from public, anon;
grant execute on function public.revoke_session(uuid) to authenticated;

-- Sign out every session of the caller except this one; returns how many.
create or replace function public.revoke_other_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.sessions
  where user_id = uid and id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.revoke_other_sessions() from public, anon;
grant execute on function public.revoke_other_sessions() to authenticated;
