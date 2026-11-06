-- The admin roster watch (founder, 6/11/2026 — «I can't watch everything alone»): who holds an admin role is the most
-- sensitive thing in the app, so any change — someone added, removed, or moved to another role — is told to the founder
-- by the function watch (src/lib/server/function-watch.ts) within 10 minutes. The last roster seen is kept in its own
-- table (RLS on, no policy: only this function reads or writes it), never in app_settings, which every member can read.
-- Additive only.
create table if not exists public.admin_roster_seen (
  user_id uuid primary key,
  role    text not null,
  seen_at timestamptz not null default now()
);
alter table public.admin_roster_seen enable row level security;
revoke all on public.admin_roster_seen from public, anon, authenticated;

-- The changes since the last call: [{ "change": "added" | "removed" | "role", "email": "so***@gmail.com", "role": …,
-- "was": … }]. The first call only records the roster (nothing to compare with). Emails are masked: the founder knows his
-- team by the first letters, and nothing more than that leaves the database.
create or replace function public.bot_admin_roster_changes(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean;
  v_out jsonb;
begin
  perform public.require_bot(p_key);
  v_first := not exists (select 1 from public.admin_roster_seen);
  with now_roster as (
    select a.user_id, a.role from public.app_admins a
  ), diff as (
    select case when s.user_id is null then 'added' when n.user_id is null then 'removed' else 'role' end as change,
           coalesce(n.user_id, s.user_id) as user_id, n.role as role, s.role as was
    from now_roster n full join public.admin_roster_seen s on s.user_id = n.user_id
    where s.user_id is null or n.user_id is null or s.role <> n.role
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'change', d.change,
           'email', (select left(u.email::text, 2) || '***' || substr(u.email::text, strpos(u.email::text, '@')) from auth.users u where u.id = d.user_id),
           'role', d.role,
           'was', d.was)), '[]'::jsonb)
    into v_out
  from diff d;

  delete from public.admin_roster_seen s where not exists (select 1 from public.app_admins a where a.user_id = s.user_id);
  insert into public.admin_roster_seen (user_id, role)
    select a.user_id, a.role from public.app_admins a
  on conflict (user_id) do update set role = excluded.role, seen_at = now()
    where public.admin_roster_seen.role <> excluded.role;

  return case when v_first then '[]'::jsonb else v_out end;
end;
$$;
revoke all on function public.bot_admin_roster_changes(text) from public, anon, authenticated;
grant execute on function public.bot_admin_roster_changes(text) to anon, authenticated;

select public.apply_security_gate();
