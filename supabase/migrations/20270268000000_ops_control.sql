-- The Control Center (founder, 28/10/2026 — «security first; one place I can see and control»): the Droplet's own
-- health and security, as the server agent (deploy/ops-agent.py) reports it, and a few safe actions the founder can
-- ask for from the app — each one a whitelisted command the agent runs on the server, never code from the app.
--
--   ops_status    the agent's latest report (one row per key); read by super admins only, written only by the agent
--                 (the database owner — no policy lets an app user write it).
--   ops_commands  what a super admin asked for: re-publish or roll back the website, back up the database now.
--                 Asked only through ops_request(): super admin, 2FA on this session (aal2), one at a time, audited.

create table if not exists public.ops_status (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ops_status enable row level security;
drop policy if exists ops_status_select on public.ops_status;
create policy ops_status_select on public.ops_status for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.ops_status from anon, authenticated;
grant select on public.ops_status to authenticated;

create table if not exists public.ops_commands (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('website_republish', 'website_rollback', 'backup_now')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  result text,
  done_at timestamptz
);
create index if not exists ops_commands_pending_idx on public.ops_commands (requested_at) where status in ('pending', 'running');
alter table public.ops_commands enable row level security;
drop policy if exists ops_commands_select on public.ops_commands;
create policy ops_commands_select on public.ops_commands for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.ops_commands from anon, authenticated;
grant select on public.ops_commands to authenticated;

create or replace function public.ops_request(p_action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_super_admin();
  -- A server action needs the second factor on this very session, not only a password.
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if p_action not in ('website_republish', 'website_rollback', 'backup_now') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  -- One at a time: nothing new while a command waits or runs.
  if exists (select 1 from public.ops_commands where status in ('pending', 'running') and requested_at > now() - interval '30 minutes') then
    raise exception 'busy' using errcode = '55006';
  end if;
  insert into public.ops_commands (action, requested_by) values (p_action, (select auth.uid())) returning id into v_id;
  perform public.audit('OPS_REQUEST', null, null, p_action);
  return v_id;
end;
$$;
revoke all on function public.ops_request(text) from public, anon;
grant execute on function public.ops_request(text) to authenticated;
