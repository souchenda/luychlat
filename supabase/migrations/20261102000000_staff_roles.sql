-- Staff roles (RBAC) and the Super Admin console, step 1.
--
-- Roles live on public.app_admins (the existing staff table):
--   support      support tickets and system health
--   admin        + payments, users, operations settings (everything /admin had)
--   super_admin  + business metrics, pricing and limits, partner hub, staff, audit log
-- is_admin() now means admin or super_admin, so every existing admin_*
-- function keeps working for those two roles. Every staff member is required
-- to use 2FA when added (account_controls.require_2fa), and every change is audited.
--
-- Bootstrap: the people who are admins today become super_admin. No e-mail
-- address is written into code; later changes go through the Staff module,
-- which never lets the last super_admin be removed or demoted.

alter table public.app_admins add column if not exists role text not null default 'admin';
alter table public.app_admins add column if not exists added_by uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_admins_role_check') then
    alter table public.app_admins add constraint app_admins_role_check check (role in ('support', 'admin', 'super_admin'));
    update public.app_admins set role = 'super_admin';
  end if;
end $$;

-- Staff added from now on must use 2FA (admin_staff_set). Existing staff are not
-- forced here, so nobody is locked out by a deploy; the Staff list flags "No 2FA".

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.app_admins a where a.user_id = (select auth.uid());
$$;
revoke all on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()) and a.role in ('admin', 'super_admin'));
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()) and a.role = 'super_admin');
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() or not public.access_ok() then
    raise exception 'staff only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_staff() from public, anon, authenticated;

create or replace function public.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() or not public.access_ok() then
    raise exception 'super admin only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_super_admin() from public, anon, authenticated;

-- Re-scope existing functions by rewriting only their access check:
--   support tickets and system health → any staff;
--   business metrics, referral stats, payment details, audit log → super_admin.
do $$
declare
  f record;
  def text;
  changed text;
begin
  for f in
    select * from (values
      ('admin_list_tickets', 'perform public.require_admin();', 'perform public.require_staff();'),
      ('admin_update_ticket', 'perform public.require_admin();', 'perform public.require_staff();'),
      ('admin_system_status', 'if not public.is_admin() or not public.access_ok() then', 'if not public.is_staff() or not public.access_ok() then'),
      ('admin_overview', 'perform public.require_admin();', 'perform public.require_super_admin();'),
      ('admin_referral_stats', 'perform public.require_admin();', 'perform public.require_super_admin();'),
      ('admin_set_payment_instructions', 'perform public.require_admin();', 'perform public.require_super_admin();'),
      ('admin_audit_list', 'perform public.require_admin();', 'perform public.require_super_admin();'),
      ('admin_audit_verify', 'perform public.require_admin();', 'perform public.require_super_admin();')
    ) v(name, old_check, new_check)
  loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.name;
    if def is null then
      raise exception 'function % not found', f.name;
    end if;
    if position(f.new_check in def) > 0 then
      continue; -- already re-scoped
    end if;
    changed := replace(def, f.old_check, f.new_check);
    if changed = def then
      raise exception 'access check not found in %', f.name;
    end if;
    execute changed;
  end loop;
end $$;

-- Admin chats for Telegram /setgold: admins and super admins (not support).
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'bot_admin_chats';
  if def is not null and position('a.role in' in def) = 0 then
    def := replace(def, 'join public.app_admins a on a.user_id = l.user_id', 'join public.app_admins a on a.user_id = l.user_id and a.role in (''admin'', ''super_admin'')');
    execute def;
  end if;
end $$;

-- Ticket updates by support staff are audited too.
create or replace function public.audit_support_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> new.user_id and public.is_staff()
     and (new.status is distinct from old.status or new.admin_reply is distinct from old.admin_reply) then
    perform public.audit('TICKET_UPDATED', new.user_id, new.status, 'ticket:' || new.id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log: IP address and structured details on new entries
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log add column if not exists ip text check (ip is null or char_length(ip) <= 64);
alter table public.admin_audit_log add column if not exists metadata jsonb;

-- concat_ws skips nulls, so entries written before these columns hash exactly as before.
create or replace function public.audit_row_hash(r public.admin_audit_log)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws('|',
    r.prev_hash, r.seq, to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    r.actor_id, r.actor_email, r.session_id, r.action, r.target_id, r.target_email, r.note, r.ref,
    r.ip, r.metadata::text
  ), 'UTF8')), 'hex');
$$;

-- The caller's IP as the API gateway saw it (first X-Forwarded-For entry), when called from a request.
create or replace function public.request_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  h jsonb;
begin
  h := nullif(current_setting('request.headers', true), '')::jsonb;
  return left(nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), ''), 64);
exception when others then
  return null;
end;
$$;

drop function if exists public.audit(text, uuid, text, text, uuid);
create or replace function public.audit(p_action text, p_target uuid default null, p_note text default null, p_ref text default null, p_actor uuid default null, p_metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, (select auth.uid()));
  v_session uuid;
begin
  begin
    v_session := case when p_actor is null then nullif(auth.jwt() ->> 'session_id', '')::uuid end;
  exception when others then
    v_session := null;
  end;
  insert into public.admin_audit_log (actor_id, actor_email, session_id, action, target_id, target_email, note, ref, ip, metadata, seq, prev_hash, hash)
  values (
    v_actor, (select u.email::text from auth.users u where u.id = v_actor), v_session, p_action,
    p_target, (select u.email::text from auth.users u where u.id = p_target),
    left(nullif(btrim(coalesce(p_note, '')), ''), 500), left(p_ref, 120),
    case when p_actor is null then public.request_ip() end, p_metadata, 0, '', ''
  );
end;
$$;
revoke all on function public.audit(text, uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Module E: staff
-- ---------------------------------------------------------------------------
create or replace function public.admin_staff_list()
returns table (user_id uuid, email text, display_name text, role text, added_at timestamptz, mfa_enabled boolean, last_active_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select a.user_id, u.email::text, pr.display_name, a.role, a.created_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'),
         public.last_active_at(a.user_id)
  from public.app_admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles pr on pr.id = a.user_id
  order by case a.role when 'super_admin' then 0 when 'admin' then 1 else 2 end, a.created_at;
end;
$$;
revoke all on function public.admin_staff_list() from public, anon;
grant execute on function public.admin_staff_list() to authenticated;

-- Give an existing LuyChlat account a staff role (or change it). 2FA becomes required for them.
create or replace function public.admin_staff_set(p_email text, p_role text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_old text;
begin
  perform public.require_super_admin();
  if p_role not in ('support', 'admin', 'super_admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  if v_user = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  select a.role into v_old from public.app_admins a where a.user_id = v_user;
  if v_old = 'super_admin' and p_role <> 'super_admin' and (select count(*) from public.app_admins where role = 'super_admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_super_admin');
  end if;
  insert into public.app_admins (user_id, role, added_by) values (v_user, p_role, (select auth.uid()))
  on conflict (user_id) do update set role = excluded.role;
  insert into public.account_controls (user_id, require_2fa) values (v_user, true)
  on conflict (user_id) do update set require_2fa = true, updated_at = now();
  perform public.audit(case when v_old is null then 'STAFF_ADDED' else 'STAFF_ROLE_CHANGED' end, v_user, p_note, null, null,
    jsonb_build_object('from', v_old, 'to', p_role));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_staff_set(text, text, text) from public, anon;
grant execute on function public.admin_staff_set(text, text, text) to authenticated;

-- Remove staff access (they stay a normal user; their sessions end).
create or replace function public.admin_staff_remove(p_user_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  select a.role into v_old from public.app_admins a where a.user_id = p_user_id;
  if v_old is null then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  if v_old = 'super_admin' and (select count(*) from public.app_admins where role = 'super_admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_super_admin');
  end if;
  delete from public.app_admins where user_id = p_user_id;
  delete from public.admin_plan_overrides where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  perform public.audit('STAFF_REMOVED', p_user_id, p_note, null, null, jsonb_build_object('role', v_old));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_staff_remove(uuid, text) from public, anon;
grant execute on function public.admin_staff_remove(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Module A: business metrics
-- ---------------------------------------------------------------------------
-- Paying = an active subscription bought with money (KHQR or entered by an admin
-- after payment), not a trial, a referral reward or an admin's own test plan.
create or replace function public.admin_exec_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_ago timestamptz := now() - interval '30 days';
  paying_now integer;
  paying_then integer;
  churned integer;
  users_total integer;
begin
  perform public.require_super_admin();
  select count(*) into users_total from auth.users;
  select count(*) into paying_now from public.subscriptions s
  where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN');
  -- Paying 30 days ago: a paid period covered that moment.
  select count(*) into paying_then from public.subscriptions s
  where s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and s.current_period_start <= month_ago and s.current_period_end > month_ago;
  -- …and no longer paying now.
  select count(*) into churned from public.subscriptions s
  where s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and s.current_period_start <= month_ago and s.current_period_end > month_ago
    and not (s.status = 'ACTIVE' and s.current_period_end > now());
  return jsonb_build_object(
    'users', users_total,
    'dau', (select count(*) from auth.users u where public.last_active_at(u.id) > now() - interval '1 day'),
    'mau', (select count(*) from auth.users u where public.last_active_at(u.id) > month_ago),
    'new_30d', (select count(*) from auth.users u where u.created_at > month_ago),
    'paying_users', paying_now,
    'paying_by_tier', (
      select coalesce(jsonb_object_agg(t.tier, t.n), '{}'::jsonb) from (
        select p.tier, count(*) as n from public.subscriptions s join public.plans p on p.code = s.plan_code
        where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN')
        group by p.tier) t
    ),
    'trial_or_referral', (select count(*) from public.subscriptions s where s.status = 'ACTIVE' and s.current_period_end > now() and s.source in ('TRIAL', 'REFERRAL')),
    -- Monthly recurring revenue: each paying subscription at its plan's monthly equivalent.
    'mrr_usd', (
      select coalesce(round(sum(p.price_usd * 30.0 / greatest(p.period_days, 1)), 2), 0) from public.subscriptions s join public.plans p on p.code = s.plan_code
      where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN')
    ),
    'mrr_khr', (
      select coalesce(round(sum(p.price_khr * 30.0 / greatest(p.period_days, 1))), 0) from public.subscriptions s join public.plans p on p.code = s.plan_code
      where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN')
    ),
    'revenue_total', (select coalesce(jsonb_object_agg(x.currency, x.total), '{}'::jsonb) from (select currency, sum(amount) as total from public.payments where status = 'PAID' group by currency) x),
    'revenue_30d', (select coalesce(jsonb_object_agg(x.currency, x.total), '{}'::jsonb) from (select currency, sum(amount) as total from public.payments where status = 'PAID' and reviewed_at > month_ago group by currency) x),
    'payments_30d', (select count(*) from public.payments where status = 'PAID' and reviewed_at > month_ago),
    'conversion_pct', case when users_total > 0 then round(100.0 * paying_now / users_total, 1) end,
    'churn_30d_pct', case when paying_then > 0 then round(100.0 * churned / paying_then, 1) end,
    'churn_base', paying_then,
    'pending_payments', (select count(*) from public.payments where status = 'PENDING')
  );
end;
$$;
revoke all on function public.admin_exec_metrics() from public, anon;
grant execute on function public.admin_exec_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- Module B: prices and plan limits (public.plans is what the app and the
-- database already read, so a change applies at once, without a deploy)
-- ---------------------------------------------------------------------------
create or replace function public.admin_plans()
returns setof public.plans
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query select * from public.plans order by sort_order, code;
end;
$$;
revoke all on function public.admin_plans() from public, anon;
grant execute on function public.admin_plans() to authenticated;

-- Fields not given (null in p_changes) stay as they are; for limits, the key "unlimited" sets null.
create or replace function public.admin_update_plan(p_code text, p_changes jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before public.plans;
  after public.plans;
  lim text;
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  select * into before from public.plans where code = p_code for update;
  if before.code is null then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  update public.plans p set
    price_usd = coalesce((p_changes ->> 'price_usd')::numeric, p.price_usd),
    price_khr = coalesce((p_changes ->> 'price_khr')::numeric, p.price_khr),
    ai_queries_per_month = coalesce((p_changes ->> 'ai_queries_per_month')::integer, p.ai_queries_per_month),
    business_trial_days = coalesce((p_changes ->> 'business_trial_days')::integer, p.business_trial_days),
    active = case when p.code = 'FREE' then true else coalesce((p_changes ->> 'active')::boolean, p.active) end
  where p.code = p_code;
  -- Nullable limits: a number, or "unlimited".
  foreach lim in array array['max_wallets', 'max_family_members', 'max_business_workspaces'] loop
    if p_changes ? lim then
      execute format('update public.plans set %I = $1 where code = $2', lim)
      using case when p_changes ->> lim = 'unlimited' then null else (p_changes ->> lim)::integer end, p_code;
    end if;
  end loop;
  select * into after from public.plans where code = p_code;
  if after.price_usd < 0 or after.price_khr < 0 or coalesce(after.max_wallets, 1) < 1 or coalesce(after.max_family_members, 0) < 0
     or coalesce(after.max_business_workspaces, 0) < 0 or after.ai_queries_per_month < 0 or after.business_trial_days < 0
     or (after.code <> 'FREE' and after.price_usd = 0) then
    raise exception 'invalid values' using errcode = '22023';
  end if;
  perform public.audit('PLAN_PRICING_UPDATED', null, p_note, 'plan:' || p_code, null,
    jsonb_build_object('before', to_jsonb(before) - 'sort_order', 'after', to_jsonb(after) - 'sort_order'));
  return to_jsonb(after);
end;
$$;
revoke all on function public.admin_update_plan(text, jsonb, text) from public, anon;
grant execute on function public.admin_update_plan(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Module D: partner integrations. Configuration and status only — secret
-- values never enter the database; the server reads them from its environment
-- (secret_env names the variable).
-- ---------------------------------------------------------------------------
create table if not exists public.partner_integrations (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('BANK', 'MFI', 'CBC', 'BAKONG', 'OTHER')),
  name         text not null check (char_length(name) between 2 and 80),
  status       text not null default 'NOT_CONNECTED' check (status in ('NOT_CONNECTED', 'PLANNED', 'TESTING', 'LIVE', 'DISABLED')),
  endpoint_url text check (endpoint_url is null or (endpoint_url ~ '^https://' and char_length(endpoint_url) <= 300)),
  secret_env   text check (secret_env is null or secret_env ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  notes        text check (notes is null or char_length(notes) <= 1000),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
alter table public.partner_integrations enable row level security;
revoke all on public.partner_integrations from anon, authenticated;

create or replace function public.admin_partners()
returns setof public.partner_integrations
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query select * from public.partner_integrations order by kind, name;
end;
$$;
revoke all on function public.admin_partners() from public, anon;
grant execute on function public.admin_partners() to authenticated;

create or replace function public.admin_save_partner(p_id uuid, p_value jsonb, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  before jsonb;
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.partner_integrations (kind, name, status, endpoint_url, secret_env, notes, updated_by)
    values (p_value ->> 'kind', btrim(p_value ->> 'name'), coalesce(p_value ->> 'status', 'NOT_CONNECTED'),
            nullif(btrim(coalesce(p_value ->> 'endpoint_url', '')), ''), nullif(btrim(coalesce(p_value ->> 'secret_env', '')), ''),
            nullif(btrim(coalesce(p_value ->> 'notes', '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    select to_jsonb(p) into before from public.partner_integrations p where p.id = p_id;
    update public.partner_integrations set
      kind = p_value ->> 'kind', name = btrim(p_value ->> 'name'), status = coalesce(p_value ->> 'status', status),
      endpoint_url = nullif(btrim(coalesce(p_value ->> 'endpoint_url', '')), ''),
      secret_env = nullif(btrim(coalesce(p_value ->> 'secret_env', '')), ''),
      notes = nullif(btrim(coalesce(p_value ->> 'notes', '')), ''),
      updated_at = now(), updated_by = (select auth.uid())
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'not found' using errcode = '22023';
    end if;
  end if;
  perform public.audit('PARTNER_SAVED', null, p_note, 'partner:' || v_id, null,
    jsonb_build_object('before', before, 'after', (select to_jsonb(p) from public.partner_integrations p where p.id = v_id)));
  return v_id;
end;
$$;
revoke all on function public.admin_save_partner(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_save_partner(uuid, jsonb, text) to authenticated;

-- my_plan: add the caller's staff role for the app's navigation.
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'my_plan';
  if position('''staff_role''' in def) = 0 then
    def := replace(def, '''is_admin'', public.is_admin(),', '''is_admin'', public.is_admin(), ''staff_role'', public.staff_role(),');
    if position('''staff_role''' in def) = 0 then
      raise exception 'my_plan: is_admin field not found';
    end if;
    execute def;
  end if;
end $$;

select public.apply_security_gate();
