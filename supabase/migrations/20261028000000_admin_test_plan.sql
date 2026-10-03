-- Admin test mode: an admin can try their OWN account as FREE, PRO or ULTRA
-- for a few hours, to check limits end to end (app, database rules, bot).
-- The override sits in front of the real subscription in plan_code_of — the
-- one place every plan rule reads — so nothing else changes; the real
-- subscription is never touched, and the override expires by itself.
-- Admin statistics and the subscriber list keep reading real subscriptions.

create table if not exists public.admin_plan_overrides (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  plan_code  text not null references public.plans (code),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.admin_plan_overrides enable row level security;
revoke all on public.admin_plan_overrides from anon, authenticated;

-- The plan in force: an admin's unexpired test plan, else the active subscription, else FREE.
create or replace function public.plan_code_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.plan_code from public.admin_plan_overrides o
     join public.app_admins a on a.user_id = o.user_id
     where o.user_id = p_user_id and o.expires_at > now()),
    (select s.plan_code from public.subscriptions s
     where s.user_id = p_user_id and s.status = 'ACTIVE' and s.current_period_end > now()),
    'FREE'
  );
$$;

-- Start / change / end the caller's test plan: 'FREE' | 'PRO' | 'ULTRA', or null to end it.
create or replace function public.admin_set_test_plan(p_tier text, p_hours integer default 2)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_code text;
begin
  if not public.is_admin() or not public.access_ok() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_tier is null or p_tier = '' then
    delete from public.admin_plan_overrides where user_id = uid;
    insert into public.server_events (level, source, message) values ('security', 'test-plan', 'Admin ended plan test mode');
    return public.my_plan();
  end if;
  v_code := case upper(p_tier) when 'FREE' then 'FREE' when 'PRO' then 'PRO_MONTHLY' when 'ULTRA' then 'ULTRA_MONTHLY' end;
  if v_code is null or not exists (select 1 from public.plans pl where pl.code = v_code) then
    raise exception 'invalid tier' using errcode = '22023';
  end if;
  insert into public.admin_plan_overrides (user_id, plan_code, expires_at)
  values (uid, v_code, now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 2), 24))))
  on conflict (user_id) do update set plan_code = excluded.plan_code, expires_at = excluded.expires_at, created_at = now();
  insert into public.server_events (level, source, message)
  values ('security', 'test-plan', format('Admin testing own account as %s for %s h', upper(p_tier), greatest(1, least(coalesce(p_hours, 2), 24))));
  return public.my_plan();
end;
$$;
revoke all on function public.admin_set_test_plan(text, integer) from public, anon;
grant execute on function public.admin_set_test_plan(text, integer) to authenticated;

-- my_plan, as before, plus the active test plan (for the app's banner).
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.plans;
  s public.subscriptions;
  used integer;
  first_business uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  p := public.plan_of(uid);
  select * into s from public.subscriptions where user_id = uid;
  select coalesce((select ai_queries from public.usage_counters where user_id = uid and month = public.current_ai_month()), 0) into used;
  select id into first_business from public.workspaces where user_id = uid and type = 'BUSINESS' order by created_at, id limit 1;
  return jsonb_build_object(
    'tier', p.tier,
    'plan_code', p.code,
    'period_end', case when p.tier <> 'FREE' then s.current_period_end end,
    'last_plan_code', s.plan_code,
    'last_period_end', s.current_period_end,
    'max_wallets', p.max_wallets,
    'max_family_members', p.max_family_members,
    'max_business_workspaces', p.max_business_workspaces,
    'business_trial_ends_at', case when p.tier = 'FREE' and first_business is not null then (public.workspace_plan_access(first_business)).trial_ends_at end,
    'ai_queries_per_month', p.ai_queries_per_month,
    'ai_queries_used', used,
    'can_export', p.can_export,
    'can_credit_score', p.can_credit_score,
    'is_admin', public.is_admin(),
    'test_plan', (
      select jsonb_build_object('tier', tp.tier, 'expires_at', o.expires_at)
      from public.admin_plan_overrides o join public.plans tp on tp.code = o.plan_code
      where o.user_id = uid and o.expires_at > now() and public.is_admin()
    )
  );
end;
$$;

select public.apply_security_gate();
