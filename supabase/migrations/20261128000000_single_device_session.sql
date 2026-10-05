-- One active device per account (like mobile banking): after a sign-in the app
-- revokes every other session (Supabase signOut scope "others" + this cleanup),
-- and the other device notices through my_session_alive() and signs out.

-- Only a live session may sign the others out: a device that was itself just
-- signed out still holds a valid-looking token for up to an hour, and must not
-- be able to kick out the new device.
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
  if not public.session_alive() then
    raise exception 'session_revoked' using errcode = '42501';
  end if;
  delete from auth.sessions
  where user_id = uid and id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.revoke_other_sessions() from public, anon;
grant execute on function public.revoke_other_sessions() to authenticated;

-- Is this device's session still the account's? (false once signed in elsewhere)
create or replace function public.my_session_alive()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and public.session_alive();
$$;
revoke all on function public.my_session_alive() from public, anon;
grant execute on function public.my_session_alive() to authenticated;

-- Called by the app right after a sign-in. Normal accounts: every other
-- session goes ('claimed'). Owner / super admins may stay signed in on several
-- devices at once (admin console on a laptop + testing on a phone): 'exempt'.
create or replace function public.claim_single_session()
returns text
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
  if public.is_super_admin() then
    return 'exempt';
  end if;
  perform public.revoke_other_sessions();
  return 'claimed';
end;
$$;
revoke all on function public.claim_single_session() from public, anon;
grant execute on function public.claim_single_session() to authenticated;
