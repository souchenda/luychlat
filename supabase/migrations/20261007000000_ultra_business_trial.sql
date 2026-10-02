-- Free / Pro / Ultra. Idempotent.
--   Free  : Personal + one Business workspace on a 90-day trial (read-only after)
--   Pro   : Personal + one Business workspace
--   Ultra : Personal + any number of Business workspaces
-- A Business workspace beyond the plan's allowance, or a Free one after its
-- trial, stays readable (and exportable) but can't be changed. Nothing is
-- deleted when a plan ends.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
alter table public.plans drop constraint if exists plans_tier_check;
alter table public.plans add constraint plans_tier_check check (tier in ('FREE', 'PRO', 'ULTRA'));
-- null = unlimited
alter table public.plans add column if not exists max_business_workspaces integer;
alter table public.plans add column if not exists business_trial_days integer not null default 0;

update public.plans set max_business_workspaces = 1, business_trial_days = 90 where code = 'FREE';
update public.plans set max_business_workspaces = 1, business_trial_days = 0, price_usd = 2.99, price_khr = 12000 where code = 'PRO_MONTHLY';
update public.plans set max_business_workspaces = 1, business_trial_days = 0, price_usd = 24.99, price_khr = 100000 where code = 'PRO_YEARLY';

insert into public.plans (code, tier, name, price_usd, price_khr, period_days, max_wallets, max_family_members, ai_queries_per_month, can_export, can_credit_score, sort_order, max_business_workspaces, business_trial_days)
values
  ('ULTRA_MONTHLY', 'ULTRA', 'Ultra Monthly', 6.99,  28000,  30,  null, null, 100, true, true, 3, null, 0),
  ('ULTRA_YEARLY',  'ULTRA', 'Ultra Yearly',  59.99, 240000, 365, null, null, 100, true, true, 4, null, 0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Paid = PRO or ULTRA. Rewrites the current definitions of every function that
-- still treats 'PRO' as the only paid tier (request, grant, admin list, …).
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosrc like '%tier = ''PRO''%' or p.prosrc like '%then ''PRO'' else ''FREE''%')
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'tier = ''PRO''', 'tier in (''PRO'', ''ULTRA'')');
    -- Admin user list: show the real tier of an active plan.
    def := replace(def, 'then ''PRO'' else ''FREE''', 'then (select pl.tier from public.plans pl where pl.code = s.plan_code) else ''FREE''');
    execute def;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Business trial: counted from the business workspace's trial start. Existing
-- workspaces start their 90 days now, so nobody's trial is already over.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'trial_started_at'
  ) then
    alter table public.workspaces add column trial_started_at timestamptz not null default now();
  end if;
end $$;

-- Whether the owner's plan lets this workspace be changed, and why not.
--   reason: null (allowed) | 'TRIAL_ENDED' | 'PLAN_LIMIT'
create or replace function public.workspace_plan_access(p_workspace_id uuid, out writable boolean, out reason text, out trial_ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workspaces;
  p public.plans;
  business_rank integer;
begin
  writable := true;
  select * into w from public.workspaces where id = p_workspace_id;
  if not found or w.type <> 'BUSINESS' then
    return;
  end if;
  p := public.plan_of(w.user_id);
  -- 1 = the owner's first business workspace.
  select count(*) + 1 into business_rank
  from public.workspaces o
  where o.user_id = w.user_id and o.type = 'BUSINESS' and (o.created_at, o.id) < (w.created_at, w.id);
  if p.max_business_workspaces is not null and business_rank > p.max_business_workspaces then
    writable := false;
    reason := 'PLAN_LIMIT';
    return;
  end if;
  if p.tier = 'FREE' then
    trial_ends_at := w.trial_started_at + make_interval(days => p.business_trial_days);
    if now() >= trial_ends_at then
      writable := false;
      reason := 'TRIAL_ENDED';
    end if;
  end if;
end;
$$;
revoke all on function public.workspace_plan_access(uuid) from public, anon;
grant execute on function public.workspace_plan_access(uuid) to authenticated;

-- Every write check (RLS and RPCs) goes through here: role AND plan.
create or replace function public.can_write_workspace(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()) and m.role in ('OWNER', 'MEMBER')
  ) and (public.workspace_plan_access(ws_id)).writable;
$$;

-- Plan access of each workspace the caller belongs to (for the app's notices).
create or replace function public.my_workspace_access()
returns table (workspace_id uuid, writable boolean, reason text, trial_ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id, a.writable, a.reason, a.trial_ends_at
  from public.workspace_members m
  cross join lateral public.workspace_plan_access(m.workspace_id) a
  where m.user_id = (select auth.uid());
$$;
revoke all on function public.my_workspace_access() from public, anon;
grant execute on function public.my_workspace_access() to authenticated;

-- ---------------------------------------------------------------------------
-- One Personal workspace per user (one owned Family is enforced by
-- create_family_workspace); Business workspaces are limited by the plan
-- instead (create_business_workspace).
-- ---------------------------------------------------------------------------
alter table public.workspaces drop constraint if exists workspaces_user_id_type_key;
create unique index if not exists workspaces_one_personal_idx on public.workspaces (user_id) where type = 'PERSONAL';

-- ---------------------------------------------------------------------------
-- Ultra: add more business workspaces.
-- ---------------------------------------------------------------------------
create or replace function public.create_business_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.plans;
  owned integer;
  result public.workspaces;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  p := public.plan_of(uid);
  select count(*) into owned from public.workspaces where user_id = uid and type = 'BUSINESS';
  if p.max_business_workspaces is not null and owned >= p.max_business_workspaces then
    raise exception 'plan_limit:business' using errcode = 'P0001', hint = p.max_business_workspaces::text;
  end if;
  insert into public.workspaces (user_id, name, type)
  values (uid, coalesce(nullif(left(btrim(p_name), 60), ''), 'អាជីវកម្ម'), 'BUSINESS')
  returning * into result;
  perform public.seed_default_categories(result.id, 'BUSINESS');
  return result;
end;
$$;
revoke all on function public.create_business_workspace(text) from public, anon;
grant execute on function public.create_business_workspace(text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_plan: business allowance and the trial end of the first business.
-- ---------------------------------------------------------------------------
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
    'is_admin', public.is_admin()
  );
end;
$$;
