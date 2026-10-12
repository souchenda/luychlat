-- The app's owner never expires: a super_admin is ULTRA for life — no end date, no renewal.
-- Derived from the role (app_admins), so every plan check (plan_code_of → plan_of → limits,
-- workspace access, the bot) sees ULTRA without a date; the subscriptions row, if any, is left
-- as it is and simply no longer decides. An admin's own test plan (admin_plan_overrides) still
-- comes first, so the owner can try the app as FREE / PRO.

create or replace function public.is_lifetime(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = p_user_id and a.role = 'super_admin');
$$;
revoke all on function public.is_lifetime(uuid) from public, anon;
grant execute on function public.is_lifetime(uuid) to authenticated, service_role;

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
    case when public.is_lifetime(p_user_id) then 'ULTRA_YEARLY' end,
    (select s.plan_code from public.subscriptions s
     where s.user_id = p_user_id and s.status = 'ACTIVE' and s.current_period_end > now()),
    'FREE'
  );
$$;

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
  testing jsonb;
  lifetime boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  p := public.plan_of(uid);
  select * into s from public.subscriptions where user_id = uid;
  select coalesce((select ai_queries from public.usage_counters where user_id = uid and month = public.current_ai_month()), 0) into used;
  select id into first_business from public.workspaces where user_id = uid and type = 'BUSINESS' order by created_at, id limit 1;
  select jsonb_build_object('tier', tp.tier, 'expires_at', o.expires_at) into testing
  from public.admin_plan_overrides o join public.plans tp on tp.code = o.plan_code
  where o.user_id = uid and o.expires_at > now() and public.is_admin();
  lifetime := public.is_lifetime(uid);
  return jsonb_build_object(
    'tier', p.tier,
    'plan_code', p.code,
    'period_end', case when p.tier <> 'FREE' and not (lifetime and testing is null) then s.current_period_end end,
    'last_plan_code', s.plan_code,
    'last_period_end', case when not lifetime then s.current_period_end end,
    'lifetime', lifetime and testing is null,
    'max_wallets', p.max_wallets,
    'max_family_members', p.max_family_members,
    'max_business_workspaces', p.max_business_workspaces,
    'business_trial_ends_at', case when p.tier = 'FREE' and first_business is not null then (public.workspace_plan_access(first_business)).trial_ends_at end,
    'ai_queries_per_month', p.ai_queries_per_month,
    'ai_queries_used', used,
    'can_export', p.can_export,
    'can_credit_score', p.can_credit_score,
    'is_admin', public.is_admin(), 'staff_role', public.staff_role(),
    'test_plan', testing
  );
end;
$$;

-- Admin console: the lifetime accounts, shown «LIFETIME (Permanent)» instead of an end date.
create or replace function public.admin_lifetime_users()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return array(select a.user_id from public.app_admins a where a.role = 'super_admin');
end;
$$;
revoke all on function public.admin_lifetime_users() from public, anon;
grant execute on function public.admin_lifetime_users() to authenticated;

select public.apply_security_gate();
