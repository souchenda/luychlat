-- Subscriptions (Step A): plans, subscriptions, manual payment approval,
-- usage quotas, admin tools, and plan limits enforced in the database.
-- Re-runnable. Step B (KHQR / Bakong) adds automatic payment on top.
--
-- Plan of a user = their ACTIVE subscription while current_period_end is in
-- the future, otherwise FREE. Nothing has to run when a plan expires.
-- Clients can read only their own rows and can never write plans,
-- subscriptions or payments directly: paid upgrades go through an admin
-- (now) or the payment server (Step B).

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  code                  text primary key,
  tier                  text not null check (tier in ('FREE', 'PRO')),
  name                  text not null,
  price_usd             numeric(10, 2) not null default 0,
  price_khr             numeric(12, 0) not null default 0,
  period_days           integer,
  -- null = unlimited
  max_wallets           integer,
  max_family_members    integer,
  ai_queries_per_month  integer not null default 0,
  can_export            boolean not null default false,
  can_credit_score      boolean not null default false,
  sort_order            integer not null default 0,
  active                boolean not null default true
);
alter table public.plans enable row level security;
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated using (true);

insert into public.plans (code, tier, name, price_usd, price_khr, period_days, max_wallets, max_family_members, ai_queries_per_month, can_export, can_credit_score, sort_order)
values
  ('FREE',        'FREE', 'Free',        0,     0,      null, 2,    1,    0,   false, false, 0),
  ('PRO_MONTHLY', 'PRO',  'Pro Monthly', 2.99,  12000,  30,   null, null, 100, true,  true,  1),
  ('PRO_YEARLY',  'PRO',  'Pro Yearly',  24.99, 100000, 365,  null, null, 100, true,  true,  2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Subscriptions, payments, history, usage, admins, settings
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  plan_code            text not null references public.plans (code),
  status               text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null,
  source               text not null default 'ADMIN' check (source in ('ADMIN', 'KHQR', 'TRIAL', 'REFERRAL')),
  note                 text check (note is null or char_length(note) <= 500),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);
alter table public.subscriptions
  drop constraint if exists subscriptions_source_check,
  add constraint subscriptions_source_check check (source in ('ADMIN', 'KHQR', 'TRIAL', 'REFERRAL'));
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  plan_code    text not null references public.plans (code),
  amount       numeric(12, 2) not null check (amount >= 0),
  currency     public.currency_code not null,
  method       text not null check (method in ('BANK_TRANSFER', 'KHQR', 'CASH', 'OTHER')),
  reference    text check (reference is null or char_length(reference) <= 120),
  status       text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'REJECTED', 'EXPIRED')),
  note         text check (note is null or char_length(note) <= 500),
  bakong_md5   text,
  bakong_hash  text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users (id) on delete set null
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
alter table public.payments enable row level security;
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.subscription_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  plan_code  text,
  period_end timestamptz,
  payment_id uuid references public.payments (id) on delete set null,
  actor      uuid references auth.users (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, created_at desc);
alter table public.subscription_events enable row level security;
drop policy if exists subscription_events_select_own on public.subscription_events;
create policy subscription_events_select_own on public.subscription_events
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.usage_counters (
  user_id     uuid not null references auth.users (id) on delete cascade,
  month       date not null,
  ai_queries  integer not null default 0,
  primary key (user_id, month)
);
alter table public.usage_counters enable row level security;
drop policy if exists usage_counters_select_own on public.usage_counters;
create policy usage_counters_select_own on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));

-- Admins are added by hand in the SQL editor (see docs/subscriptions.md).
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

-- App-wide settings readable by signed-in users (e.g. how to pay), written by admins.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Activity (admin analytics): auth.users.last_sign_in_at only moves on a new
-- sign-in, so the app also stamps profiles.last_seen_at when it opens.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists transactions_created_by_idx on public.transactions (created_by, created_at desc);

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
  where id = (select auth.uid()) and (last_seen_at is null or last_seen_at < now() - interval '15 minutes');
$$;

-- Latest sign of life: sign-in, app open, or a recorded transaction.
create or replace function public.last_active_at(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    (select u.last_sign_in_at from auth.users u where u.id = p_user_id),
    (select p.last_seen_at from public.profiles p where p.id = p_user_id),
    (select max(t.created_at) from public.transactions t where t.created_by = p_user_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Plan helpers
-- ---------------------------------------------------------------------------
create or replace function public.plan_code_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.plan_code from public.subscriptions s
     where s.user_id = p_user_id and s.status = 'ACTIVE' and s.current_period_end > now()),
    'FREE'
  );
$$;

create or replace function public.plan_of(p_user_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.plans p where p.code = public.plan_code_of(p_user_id);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.current_ai_month()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Asia/Phnom_Penh')::date;
$$;

-- Everything the app needs to know about the caller's plan in one call.
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
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  p := public.plan_of(uid);
  select * into s from public.subscriptions where user_id = uid;
  select coalesce((select ai_queries from public.usage_counters where user_id = uid and month = public.current_ai_month()), 0) into used;
  return jsonb_build_object(
    'tier', p.tier,
    'plan_code', p.code,
    'period_end', case when p.tier = 'PRO' then s.current_period_end end,
    'last_plan_code', s.plan_code,
    'last_period_end', s.current_period_end,
    'max_wallets', p.max_wallets,
    'max_family_members', p.max_family_members,
    'ai_queries_per_month', p.ai_queries_per_month,
    'ai_queries_used', used,
    'can_export', p.can_export,
    'can_credit_score', p.can_credit_score,
    'is_admin', public.is_admin()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Limit: wallets (counted per workspace owner; a Pro owner's family gets Pro)
-- ---------------------------------------------------------------------------
create or replace function public.guard_wallet_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  max_wallets integer;
  used integer;
begin
  if (select auth.uid()) is null or coalesce(current_setting('luysmart.import', true), '') = 'on' then
    return new;
  end if;
  -- Only creating a wallet or bringing one back from the archive counts.
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null) then
    return new;
  end if;
  if new.archived_at is not null then
    return new;
  end if;
  select user_id into owner from public.workspaces where id = new.workspace_id;
  max_wallets := (public.plan_of(owner)).max_wallets;
  if max_wallets is null then
    return new;
  end if;
  select count(*) into used
  from public.wallets_accounts w join public.workspaces ws on ws.id = w.workspace_id
  where ws.user_id = owner and w.archived_at is null and w.id <> new.id;
  if used >= max_wallets then
    raise exception 'plan_limit:wallets' using errcode = 'P0001', hint = max_wallets::text;
  end if;
  return new;
end;
$$;

create or replace trigger wallets_accounts_plan_limit
  before insert or update of archived_at on public.wallets_accounts
  for each row execute function public.guard_wallet_limit();

-- ---------------------------------------------------------------------------
-- Limit: family members (owner's plan). Re-declares the two invite functions
-- from 20261001070100 with the limit check added.
-- ---------------------------------------------------------------------------
create or replace function public.family_member_limit_reached(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select count(*) >= (public.plan_of(ws.user_id)).max_family_members
    from public.workspace_members m join public.workspaces ws on ws.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.role <> 'OWNER'
    group by ws.user_id
  ), false);
$$;

create or replace function public.create_workspace_invite(p_workspace_id uuid, p_role public.workspace_role default 'MEMBER')
returns public.workspace_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  new_code text;
  result public.workspace_invites;
begin
  if not public.owns_workspace(p_workspace_id) then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and type = 'FAMILY') then
    raise exception 'only a family workspace can be shared' using errcode = '22023';
  end if;
  if public.family_member_limit_reached(p_workspace_id) then
    raise exception 'plan_limit:family' using errcode = 'P0001';
  end if;
  if p_role not in ('MEMBER', 'VIEWER') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_invites
      where workspace_id = p_workspace_id and used_at is null and expires_at > now()) >= 10 then
    raise exception 'too_many_invites' using errcode = '22023';
  end if;

  for attempt in 1..10 loop
    -- The first 6 bytes of a v4 UUID are random; 256 is a multiple of 32, so no bias.
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    for i in 0..5 loop
      new_code := new_code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
    end loop;
    begin
      insert into public.workspace_invites (workspace_id, code, role, created_by)
      values (p_workspace_id, new_code, p_role, uid)
      returning * into result;
      return result;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  raise exception 'could not generate a code' using errcode = 'P0001';
end;
$$;

create or replace function public.lookup_workspace_invite(p_code text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv public.workspace_invites;
  ws public.workspaces;
  inviter text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.invite_failures
      where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into inv from public.workspace_invites where code = normalized for update;
  if not found then
    insert into public.invite_failures (user_id) values (uid);
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;

  if exists (select 1 from public.workspace_members where workspace_id = inv.workspace_id and user_id = uid) then
    return jsonb_build_object('status', 'already_member', 'workspace_id', ws.id, 'workspace_name', ws.name);
  end if;
  if inv.used_at is not null then
    return jsonb_build_object('status', 'used');
  end if;
  if inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  -- The owner's plan caps how many people can join.
  if public.family_member_limit_reached(inv.workspace_id) then
    return jsonb_build_object('status', 'member_limit');
  end if;

  select display_name into inviter from public.profiles where id = inv.created_by;
  if not p_accept then
    return jsonb_build_object(
      'status', 'ok', 'workspace_id', ws.id, 'workspace_name', ws.name,
      'inviter_name', coalesce(inviter, ''), 'role', inv.role
    );
  end if;

  insert into public.profiles (id, display_name)
  values (uid, coalesce(public.default_display_name(uid), 'Member'))
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, uid, inv.role);
  update public.workspace_invites set used_by = uid, used_at = now() where id = inv.id;
  return jsonb_build_object('status', 'ok', 'workspace_id', ws.id, 'workspace_name', ws.name, 'role', inv.role);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI quota (Pro: server-provided AI). p_commit = false only checks.
-- ---------------------------------------------------------------------------
create or replace function public.use_ai_query(p_commit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  lim := (public.plan_of(uid)).ai_queries_per_month;
  select coalesce((select ai_queries from public.usage_counters where user_id = uid and month = public.current_ai_month()), 0)
    into used;
  if lim <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan_required', 'limit', 0, 'used', used);
  end if;
  if used >= lim then
    return jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'limit', lim, 'used', used);
  end if;
  if p_commit then
    insert into public.usage_counters (user_id, month, ai_queries) values (uid, public.current_ai_month(), 1)
    on conflict (user_id, month) do update set ai_queries = public.usage_counters.ai_queries + 1
    returning ai_queries into used;
  end if;
  return jsonb_build_object('ok', true, 'limit', lim, 'used', used);
end;
$$;

-- ---------------------------------------------------------------------------
-- Upgrade requests (manual payment, approved by an admin)
-- ---------------------------------------------------------------------------
create or replace function public.request_upgrade(p_plan_code text, p_method text, p_reference text, p_currency public.currency_code)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.plans;
  result public.payments;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into p from public.plans where code = p_plan_code and tier = 'PRO' and active;
  if not found then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_method not in ('BANK_TRANSFER', 'KHQR', 'CASH', 'OTHER') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;
  if (select count(*) from public.payments where user_id = uid and status = 'PENDING') >= 3 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;
  insert into public.payments (user_id, plan_code, amount, currency, method, reference)
  values (
    uid, p.code, case when p_currency = 'USD' then p.price_usd else p.price_khr end, p_currency, p_method,
    nullif(left(trim(coalesce(p_reference, '')), 120), '')
  )
  returning * into result;
  insert into public.subscription_events (user_id, kind, plan_code, payment_id, actor)
  values (uid, 'REQUESTED', p.code, result.id, uid);
  return result;
end;
$$;

create or replace function public.cancel_upgrade_request(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments set status = 'EXPIRED', note = 'Cancelled by the user', reviewed_at = now()
  where id = p_payment_id and user_id = (select auth.uid()) and status = 'PENDING';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin tools (every function checks is_admin())
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

-- Internal: extend from the later of now and the current end, record the event.
create or replace function public.extend_subscription(
  p_user_id uuid, p_plan_code text, p_days integer, p_source text, p_actor uuid, p_note text, p_payment_id uuid
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_end timestamptz;
  result public.subscriptions;
begin
  if p_days is null or p_days <= 0 or p_days > 3660 then
    raise exception 'invalid number of days' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plans where code = p_plan_code and tier = 'PRO') then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  select current_period_end into current_end from public.subscriptions
  where user_id = p_user_id and status = 'ACTIVE' and current_period_end > now();
  -- A free reward on top of a paid plan keeps that plan.
  if p_source = 'REFERRAL' and current_end is not null then
    select plan_code into p_plan_code from public.subscriptions where user_id = p_user_id;
  end if;
  insert into public.subscriptions (user_id, plan_code, status, current_period_start, current_period_end, source, note, updated_at, updated_by)
  values (p_user_id, p_plan_code, 'ACTIVE', now(), greatest(now(), coalesce(current_end, now())) + make_interval(days => p_days), p_source, p_note, now(), p_actor)
  on conflict (user_id) do update set
    plan_code = excluded.plan_code,
    status = 'ACTIVE',
    current_period_start = case when current_end is null then now() else public.subscriptions.current_period_start end,
    current_period_end = excluded.current_period_end,
    source = excluded.source,
    note = excluded.note,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning * into result;
  insert into public.subscription_events (user_id, kind, plan_code, period_end, payment_id, actor, note)
  values (p_user_id, 'EXTENDED', p_plan_code, result.current_period_end, p_payment_id, p_actor, p_note);
  return result;
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  with activity as (
    select u.id, public.last_active_at(u.id) as last_active,
      exists (select 1 from public.subscriptions s where s.user_id = u.id and s.status = 'ACTIVE' and s.current_period_end > now()) as pro
    from auth.users u
  )
  select jsonb_build_object(
    'users', count(*),
    'dau', count(*) filter (where last_active > now() - interval '24 hours'),
    'mau', count(*) filter (where last_active > now() - interval '30 days'),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'pro_active', count(*) filter (where pro),
    'free_users', count(*) filter (where not pro),
    'expiring_7d', (select count(*) from public.subscriptions where status = 'ACTIVE' and current_period_end > now() and current_period_end <= now() + interval '7 days'),
    'pending_payments', (select count(*) from public.payments where status = 'PENDING'),
    'paid_30d_usd', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and currency = 'USD' and reviewed_at > now() - interval '30 days'),
    'paid_30d_khr', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and currency = 'KHR' and reviewed_at > now() - interval '30 days')
  )
  into result
  from activity;
  return result;
end;
$$;

create or replace function public.admin_list_subscribers(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, joined_at timestamptz, plan_code text, tier text, status text,
  period_end timestamptz, pending_payments integer, last_paid_at timestamptz, last_active_at timestamptz, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  with rows as (
    select
      u.id as user_id, u.email::text as email, pr.display_name, u.created_at as joined_at,
      s.plan_code, case when s.status = 'ACTIVE' and s.current_period_end > now() then 'PRO' else 'FREE' end as tier,
      s.status, s.current_period_end as period_end,
      (select count(*)::integer from public.payments p where p.user_id = u.id and p.status = 'PENDING') as pending_payments,
      (select max(p.reviewed_at) from public.payments p where p.user_id = u.id and p.status = 'PAID') as last_paid_at,
      public.last_active_at(u.id) as last_active_at
    from auth.users u
    left join public.subscriptions s on s.user_id = u.id
    left join public.profiles pr on pr.id = u.id
    where coalesce(p_search, '') = ''
      or u.email ilike '%' || p_search || '%'
      or pr.display_name ilike '%' || p_search || '%'
      or u.id::text = p_search
  ), filtered as (
    select * from rows r
    where case coalesce(p_filter, 'all')
      when 'pro' then r.tier = 'PRO'
      when 'free' then r.tier = 'FREE'
      when 'expiring' then r.tier = 'PRO' and r.period_end <= now() + interval '7 days'
      when 'expired' then r.tier = 'FREE' and r.period_end is not null
      when 'pending' then r.pending_payments > 0
      else true
    end
  )
  select f.*, count(*) over () as total from filtered f
  order by f.pending_payments desc, f.period_end asc nulls last, f.joined_at desc
  limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_extend_subscription(p_user_id uuid, p_plan_code text, p_days integer, p_note text)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return public.extend_subscription(p_user_id, p_plan_code, p_days, 'ADMIN', (select auth.uid()), nullif(left(p_note, 500), ''), null);
end;
$$;

-- Set an exact end date (e.g. correct a mistake); a past date ends Pro now.
create or replace function public.admin_set_subscription_end(p_user_id uuid, p_plan_code text, p_period_end timestamptz, p_note text)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  perform public.require_admin();
  if not exists (select 1 from public.plans where code = p_plan_code and tier = 'PRO') then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  insert into public.subscriptions (user_id, plan_code, status, current_period_end, source, note, updated_at, updated_by)
  values (p_user_id, p_plan_code, 'ACTIVE', p_period_end, 'ADMIN', nullif(left(p_note, 500), ''), now(), (select auth.uid()))
  on conflict (user_id) do update set
    plan_code = excluded.plan_code, status = 'ACTIVE', current_period_end = excluded.current_period_end,
    source = 'ADMIN', note = excluded.note, updated_at = now(), updated_by = excluded.updated_by
  returning * into result;
  insert into public.subscription_events (user_id, kind, plan_code, period_end, actor, note)
  values (p_user_id, 'SET_END', p_plan_code, p_period_end, (select auth.uid()), nullif(left(p_note, 500), ''));
  return result;
end;
$$;

create or replace function public.admin_cancel_subscription(p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.subscriptions set status = 'CANCELLED', current_period_end = least(current_period_end, now()),
    note = nullif(left(p_note, 500), ''), updated_at = now(), updated_by = (select auth.uid())
  where user_id = p_user_id;
  insert into public.subscription_events (user_id, kind, actor, note)
  values (p_user_id, 'CANCELLED', (select auth.uid()), nullif(left(p_note, 500), ''));
end;
$$;

create or replace function public.admin_list_payments(p_status text, p_limit integer)
returns table (
  id uuid, user_id uuid, email text, display_name text, plan_code text, amount numeric, currency public.currency_code,
  method text, reference text, status text, note text, created_at timestamptz, reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select p.id, p.user_id, u.email::text, pr.display_name, p.plan_code, p.amount, p.currency, p.method, p.reference,
         p.status, p.note, p.created_at, p.reviewed_at
  from public.payments p
  join auth.users u on u.id = p.user_id
  left join public.profiles pr on pr.id = p.user_id
  where coalesce(p_status, 'ALL') = 'ALL' or p.status = p_status
  order by (p.status = 'PENDING') desc, p.created_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$$;

-- Approving marks the payment PAID and extends Pro by the plan's period.
create or replace function public.admin_review_payment(p_payment_id uuid, p_approve boolean, p_note text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  days integer;
begin
  perform public.require_admin();
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if pay.status <> 'PENDING' then
    raise exception 'payment already reviewed' using errcode = '22023';
  end if;
  update public.payments set
    status = case when p_approve then 'PAID' else 'REJECTED' end,
    note = nullif(left(p_note, 500), ''), reviewed_at = now(), reviewed_by = (select auth.uid())
  where id = pay.id
  returning * into pay;
  if p_approve then
    select period_days into days from public.plans where code = pay.plan_code;
    perform public.extend_subscription(pay.user_id, pay.plan_code, days, 'ADMIN', (select auth.uid()), pay.note, pay.id);
  else
    insert into public.subscription_events (user_id, kind, plan_code, payment_id, actor, note)
    values (pay.user_id, 'REJECTED', pay.plan_code, pay.id, (select auth.uid()), pay.note);
  end if;
  return pay;
end;
$$;

create or replace function public.admin_user_events(p_user_id uuid)
returns setof public.subscription_events
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query select * from public.subscription_events where user_id = p_user_id order by created_at desc limit 50;
end;
$$;

-- How to pay (shown in the upgrade screen); admins edit it in /admin.
create or replace function public.admin_set_payment_instructions(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if jsonb_typeof(p_value) <> 'object' or length(p_value::text) > 4000 then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('payment_instructions', p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

insert into public.app_settings (key, value)
values ('payment_instructions', '{"bank": "", "account_name": "", "account_number": "", "note_km": "", "note_en": ""}'::jsonb)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- Referrals: both people get 7 days of Pro when a new account uses a code.
-- Only accounts younger than 7 days can redeem, once, never their own code;
-- a referrer earns at most 20 rewards per calendar month (the friend still
-- gets theirs).
-- ---------------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references auth.users (id) on delete cascade,
  referred_id      uuid not null unique references auth.users (id) on delete cascade,
  code             text not null,
  referrer_rewarded boolean not null default false,
  referred_rewarded boolean not null default false,
  reward_days      integer not null default 7,
  created_at       timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
alter table public.referrals enable row level security;
drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated using (referrer_id = (select auth.uid()) or referred_id = (select auth.uid()));

-- The caller's code (created on first use) and their referral numbers.
create or replace function public.my_referral()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  new_code text;
  my_code text;
  account_age interval;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select code into my_code from public.referral_codes where user_id = uid;
  while my_code is null loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    for i in 0..7 loop
      new_code := new_code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
    end loop;
    insert into public.referral_codes (user_id, code) values (uid, new_code)
    on conflict do nothing
    returning code into my_code;
    if my_code is null then
      select code into my_code from public.referral_codes where user_id = uid;
    end if;
  end loop;
  select now() - created_at into account_age from auth.users where id = uid;
  return jsonb_build_object(
    'code', my_code,
    'invited', (select count(*) from public.referrals where referrer_id = uid),
    'days_earned', (select coalesce(sum(reward_days), 0) from public.referrals where referrer_id = uid and referrer_rewarded),
    'referred_by', (select r.code from public.referrals r where r.referred_id = uid),
    'can_redeem', account_age < interval '7 days' and not exists (select 1 from public.referrals where referred_id = uid)
  );
end;
$$;

-- Called by the new user (from the link, or by typing the code).
create or replace function public.redeem_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  referrer uuid;
  this_month integer;
  ref public.referrals;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Shares the invite-code guessing limit.
  if (select count(*) from public.invite_failures where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select user_id into referrer from public.referral_codes where code = normalized;
  if referrer is null then
    insert into public.invite_failures (user_id) values (uid);
    return jsonb_build_object('status', 'invalid');
  end if;
  if referrer = uid then
    return jsonb_build_object('status', 'own_code');
  end if;
  if exists (select 1 from public.referrals where referred_id = uid) then
    return jsonb_build_object('status', 'already_redeemed');
  end if;
  if (select now() - created_at from auth.users where id = uid) >= interval '7 days' then
    return jsonb_build_object('status', 'too_late');
  end if;

  select count(*) into this_month from public.referrals
  where referrer_id = referrer and referrer_rewarded
    and created_at >= date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';

  insert into public.referrals (referrer_id, referred_id, code, referrer_rewarded, referred_rewarded)
  values (referrer, uid, normalized, this_month < 20, true)
  returning * into ref;

  perform public.extend_subscription(uid, 'PRO_MONTHLY', ref.reward_days, 'REFERRAL', uid, 'Referral welcome bonus', null);
  if ref.referrer_rewarded then
    perform public.extend_subscription(referrer, 'PRO_MONTHLY', ref.reward_days, 'REFERRAL', uid, 'Referral reward', null);
  end if;
  return jsonb_build_object('status', 'ok', 'days', ref.reward_days);
end;
$$;

create or replace function public.admin_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.referrals),
    'last_30d', (select count(*) from public.referrals where created_at > now() - interval '30 days'),
    'days_granted', (select coalesce(sum(reward_days * ((referrer_rewarded)::int + (referred_rewarded)::int)), 0) from public.referrals),
    'top', coalesce((
      select jsonb_agg(t order by t.invited desc)
      from (
        select r.referrer_id as user_id, u.email::text as email, pr.display_name, count(*) as invited,
               count(*) filter (where r.referrer_rewarded) * 7 as days_earned
        from public.referrals r
        join auth.users u on u.id = r.referrer_id
        left join public.profiles pr on pr.id = r.referrer_id
        group by r.referrer_id, u.email, pr.display_name
        order by count(*) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: clients call only these functions; everything else is internal.
-- ---------------------------------------------------------------------------
revoke all on function public.plan_code_of(uuid) from public, anon, authenticated;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;
revoke all on function public.extend_subscription(uuid, text, integer, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.guard_wallet_limit() from public, anon, authenticated;
revoke all on function public.family_member_limit_reached(uuid) from public, anon, authenticated;
revoke all on function public.last_active_at(uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.my_plan()', 'public.is_admin()', 'public.touch_last_seen()', 'public.current_ai_month()', 'public.use_ai_query(boolean)',
    'public.request_upgrade(text, text, text, public.currency_code)', 'public.cancel_upgrade_request(uuid)',
    'public.admin_overview()', 'public.admin_list_subscribers(text, text, integer, integer)',
    'public.admin_extend_subscription(uuid, text, integer, text)', 'public.admin_set_subscription_end(uuid, text, timestamptz, text)',
    'public.admin_cancel_subscription(uuid, text)', 'public.admin_list_payments(text, integer)',
    'public.admin_review_payment(uuid, boolean, text)', 'public.admin_user_events(uuid)',
    'public.admin_set_payment_instructions(jsonb)',
    'public.my_referral()', 'public.redeem_referral(text)', 'public.admin_referral_stats()',
    'public.create_workspace_invite(uuid, public.workspace_role)', 'public.lookup_workspace_invite(text, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- Live plan updates on the user's devices after an admin approves.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['subscriptions', 'payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
