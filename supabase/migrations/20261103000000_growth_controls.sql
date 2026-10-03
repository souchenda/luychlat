-- Super Admin step 2: referral campaign settings, promo codes, and the
-- statement-import limit as a plan setting. All changes are super_admin only
-- and audited (with before / after).

-- Settings written by functions that audit themselves (with before/after) aren't logged twice.
create or replace function public.audit_app_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('luychlat.audited', true), '') = 'on' then
    return new;
  end if;
  if (select auth.uid()) is not null and public.is_admin() then
    perform public.audit('SETTINGS_UPDATED', null, new.key, 'app_settings:' || new.key);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Referral campaign
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values ('referral_campaign', '{"active": true, "referee_days": 7, "referrer_days": 7, "monthly_cap": 20, "max_account_age_days": 7, "daily_flag": 5}'::jsonb)
on conflict (key) do nothing;

-- The campaign with defaults for anything missing.
create or replace function public.referral_campaign()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select '{"active": true, "referee_days": 7, "referrer_days": 7, "monthly_cap": 20, "max_account_age_days": 7, "daily_flag": 5}'::jsonb
         || coalesce((select s.value from public.app_settings s where s.key = 'referral_campaign'), '{}'::jsonb);
$$;
revoke all on function public.referral_campaign() from public, anon, authenticated;

-- The friend's days stay in reward_days; the referrer's own days are kept per referral.
alter table public.referrals add column if not exists referrer_reward_days integer;
update public.referrals set referrer_reward_days = reward_days where referrer_reward_days is null;
alter table public.referrals alter column referrer_reward_days set default 7;
alter table public.referrals alter column referrer_reward_days set not null;

-- Referrers whose rewards are paused (anti-fraud); their friends are still welcomed.
create table if not exists public.referral_blocks (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.referral_blocks enable row level security;
revoke all on public.referral_blocks from anon, authenticated;

create or replace function public.redeem_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c jsonb := public.referral_campaign();
  referrer uuid;
  this_month integer;
  ref public.referrals;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not coalesce((c ->> 'active')::boolean, true) then
    return jsonb_build_object('status', 'inactive');
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
  if (select now() - created_at from auth.users where id = uid) >= make_interval(days => (c ->> 'max_account_age_days')::integer) then
    return jsonb_build_object('status', 'too_late');
  end if;

  select count(*) into this_month from public.referrals
  where referrer_id = referrer and referrer_rewarded
    and created_at >= date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';

  insert into public.referrals (referrer_id, referred_id, code, referrer_rewarded, referred_rewarded, reward_days, referrer_reward_days)
  values (referrer, uid, normalized,
          this_month < (c ->> 'monthly_cap')::integer and not exists (select 1 from public.referral_blocks b where b.user_id = referrer),
          true, (c ->> 'referee_days')::integer, (c ->> 'referrer_days')::integer)
  returning * into ref;

  perform public.extend_subscription(uid, 'PRO_MONTHLY', ref.reward_days, 'REFERRAL', uid, 'Referral welcome bonus', null);
  if ref.referrer_rewarded then
    perform public.extend_subscription(referrer, 'PRO_MONTHLY', ref.referrer_reward_days, 'REFERRAL', uid, 'Referral reward', null);
  end if;
  return jsonb_build_object('status', 'ok', 'days', ref.reward_days);
end;
$$;

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
  c jsonb := public.referral_campaign();
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
    'days_earned', (select coalesce(sum(referrer_reward_days), 0) from public.referrals where referrer_id = uid and referrer_rewarded),
    'referred_by', (select r.code from public.referrals r where r.referred_id = uid),
    'can_redeem', coalesce((c ->> 'active')::boolean, true)
      and account_age < make_interval(days => (c ->> 'max_account_age_days')::integer)
      and not exists (select 1 from public.referrals where referred_id = uid),
    'active', coalesce((c ->> 'active')::boolean, true),
    'referee_days', (c ->> 'referee_days')::integer,
    'referrer_days', (c ->> 'referrer_days')::integer,
    'max_account_age_days', (c ->> 'max_account_age_days')::integer
  );
end;
$$;

-- Results, the campaign, and anti-fraud flags for the top referrers:
--   burst     ≥ daily_flag referrals in the last 24 hours
--   inactive  ≥ 5 referrals and over 80% of the friends never came back after day one
create or replace function public.admin_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c jsonb := public.referral_campaign();
begin
  perform public.require_super_admin();
  return jsonb_build_object(
    'campaign', c,
    'total', (select count(*) from public.referrals),
    'last_30d', (select count(*) from public.referrals where created_at > now() - interval '30 days'),
    'days_granted', (select coalesce(sum(reward_days * (referred_rewarded)::int + referrer_reward_days * (referrer_rewarded)::int), 0) from public.referrals),
    'top', coalesce((
      select jsonb_agg(t order by t.invited desc)
      from (
        select r.referrer_id as user_id, u.email::text as email, pr.display_name, count(*) as invited,
               coalesce(sum(r.referrer_reward_days) filter (where r.referrer_rewarded), 0) as days_earned,
               count(*) filter (where r.created_at > now() - interval '24 hours') as last_24h,
               count(*) filter (where coalesce(public.last_active_at(r.referred_id), ru.created_at) < ru.created_at + interval '1 day') as inactive_friends,
               exists (select 1 from public.referral_blocks b where b.user_id = r.referrer_id) as blocked,
               array_remove(array[
                 case when count(*) filter (where r.created_at > now() - interval '24 hours') >= (c ->> 'daily_flag')::integer then 'burst' end,
                 case when count(*) >= 5 and count(*) filter (where coalesce(public.last_active_at(r.referred_id), ru.created_at) < ru.created_at + interval '1 day') > 0.8 * count(*) then 'inactive' end
               ], null) as flags
        from public.referrals r
        join auth.users u on u.id = r.referrer_id
        join auth.users ru on ru.id = r.referred_id
        left join public.profiles pr on pr.id = r.referrer_id
        group by r.referrer_id, u.email, pr.display_name
        order by count(*) desc
        limit 20
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_referral_campaign(p_value jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before jsonb := public.referral_campaign();
  v_next jsonb;
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  v_next := jsonb_build_object(
    'active', coalesce((p_value ->> 'active')::boolean, (before ->> 'active')::boolean),
    'referee_days', coalesce((p_value ->> 'referee_days')::integer, (before ->> 'referee_days')::integer),
    'referrer_days', coalesce((p_value ->> 'referrer_days')::integer, (before ->> 'referrer_days')::integer),
    'monthly_cap', coalesce((p_value ->> 'monthly_cap')::integer, (before ->> 'monthly_cap')::integer),
    'max_account_age_days', coalesce((p_value ->> 'max_account_age_days')::integer, (before ->> 'max_account_age_days')::integer),
    'daily_flag', coalesce((p_value ->> 'daily_flag')::integer, (before ->> 'daily_flag')::integer)
  );
  if (v_next ->> 'referee_days')::integer not between 1 and 90 or (v_next ->> 'referrer_days')::integer not between 0 and 90
     or (v_next ->> 'monthly_cap')::integer not between 0 and 1000 or (v_next ->> 'max_account_age_days')::integer not between 1 and 90
     or (v_next ->> 'daily_flag')::integer not between 1 and 1000 then
    raise exception 'invalid values' using errcode = '22023';
  end if;
  perform set_config('luychlat.audited', 'on', true);
  insert into public.app_settings (key, value, updated_at) values ('referral_campaign', v_next, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.audit('REFERRAL_CAMPAIGN_UPDATED', null, p_note, null, null, jsonb_build_object('before', before, 'after', v_next));
  return v_next;
end;
$$;
revoke all on function public.admin_set_referral_campaign(jsonb, text) from public, anon;
grant execute on function public.admin_set_referral_campaign(jsonb, text) to authenticated;

create or replace function public.admin_set_referrer_block(p_user_id uuid, p_block boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if p_block then
    insert into public.referral_blocks (user_id, note) values (p_user_id, left(btrim(p_note), 300)) on conflict (user_id) do update set note = excluded.note;
  else
    delete from public.referral_blocks where user_id = p_user_id;
  end if;
  perform public.audit(case when p_block then 'REFERRER_PAUSED' else 'REFERRER_UNPAUSED' end, p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_referrer_block(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_referrer_block(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Promo codes: free days of PRO or ULTRA (not revenue)
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check check (source in ('ADMIN', 'KHQR', 'TRIAL', 'REFERRAL', 'PROMO'));

-- A free reward on top of a paid plan keeps that plan (as for referrals).
do $$
declare
  def text := pg_get_functiondef('public.extend_subscription(uuid, text, integer, text, uuid, text, uuid)'::regprocedure);
begin
  if position('''PROMO''' in def) = 0 then
    def := replace(def, 'if p_source = ''REFERRAL'' and current_end is not null then', 'if p_source in (''REFERRAL'', ''PROMO'') and current_end is not null then');
    if position('''PROMO''' in def) = 0 then
      raise exception 'extend_subscription: reward check not found';
    end if;
    execute def;
  end if;
  -- Metrics: promo days are free PRO, like trials and referrals.
  def := pg_get_functiondef('public.admin_exec_metrics()'::regprocedure);
  if position('''PROMO''' in def) = 0 then
    def := replace(def, 's.source in (''TRIAL'', ''REFERRAL'')', 's.source in (''TRIAL'', ''REFERRAL'', ''PROMO'')');
    execute def;
  end if;
end $$;

create table if not exists public.promo_codes (
  code            text primary key check (code ~ '^[A-Z0-9]{4,20}$'),
  plan_code       text not null references public.plans (code),
  days            integer not null check (days between 1 and 366),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count  integer not null default 0,
  new_users_only  boolean not null default false,
  expires_at      timestamptz,
  active          boolean not null default true,
  note            text check (note is null or char_length(note) <= 300),
  created_by      uuid,
  created_at      timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

create table if not exists public.promo_redemptions (
  code        text not null references public.promo_codes (code) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_redemptions from anon, authenticated;

-- The signed-in user redeems a code: each code once per account.
create or replace function public.redeem_promo(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  p public.promo_codes;
  sub public.subscriptions;
begin
  if uid is null or not public.access_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Shares the code-guessing limit with invites and referrals.
  if (select count(*) from public.invite_failures where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into p from public.promo_codes where code = normalized for update;
  if p.code is null or not p.active then
    insert into public.invite_failures (user_id) values (uid);
    return jsonb_build_object('status', 'invalid');
  end if;
  if p.expires_at is not null and p.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if p.max_redemptions is not null and p.redeemed_count >= p.max_redemptions then
    return jsonb_build_object('status', 'used_up');
  end if;
  if p.new_users_only and (select now() - created_at from auth.users where id = uid) >= interval '30 days' then
    return jsonb_build_object('status', 'new_users_only');
  end if;
  insert into public.promo_redemptions (code, user_id) values (p.code, uid) on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already_redeemed');
  end if;
  update public.promo_codes set redeemed_count = redeemed_count + 1 where code = p.code;
  sub := public.extend_subscription(uid, p.plan_code, p.days, 'PROMO', uid, 'Promo code ' || p.code, null);
  return jsonb_build_object('status', 'ok', 'days', p.days, 'plan_code', sub.plan_code, 'period_end', sub.current_period_end);
end;
$$;
revoke all on function public.redeem_promo(text) from public, anon;
grant execute on function public.redeem_promo(text) to authenticated;

create or replace function public.admin_promos()
returns setof public.promo_codes
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query select * from public.promo_codes order by active desc, created_at desc;
end;
$$;
revoke all on function public.admin_promos() from public, anon;
grant execute on function public.admin_promos() to authenticated;

-- Create a code, or change an existing one (active, limits, expiry). The plan and days of a used code are kept.
create or replace function public.admin_save_promo(p_value jsonb, p_note text)
returns public.promo_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_value ->> 'code', ''), '[^A-Za-z0-9]', '', 'g'));
  before public.promo_codes;
  after public.promo_codes;
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plans where code = p_value ->> 'plan_code' and tier in ('PRO', 'ULTRA')) then
    raise exception 'invalid plan' using errcode = '22023';
  end if;
  select * into before from public.promo_codes where code = v_code for update;
  if before.code is null then
    insert into public.promo_codes (code, plan_code, days, max_redemptions, new_users_only, expires_at, active, note, created_by)
    values (v_code, p_value ->> 'plan_code', (p_value ->> 'days')::integer, nullif(p_value ->> 'max_redemptions', '')::integer,
            coalesce((p_value ->> 'new_users_only')::boolean, false), nullif(p_value ->> 'expires_at', '')::timestamptz,
            coalesce((p_value ->> 'active')::boolean, true), left(nullif(btrim(coalesce(p_value ->> 'note', '')), ''), 300), (select auth.uid()))
    returning * into after;
  else
    update public.promo_codes set
      plan_code = case when redeemed_count = 0 then p_value ->> 'plan_code' else plan_code end,
      days = case when redeemed_count = 0 then (p_value ->> 'days')::integer else days end,
      max_redemptions = nullif(p_value ->> 'max_redemptions', '')::integer,
      new_users_only = coalesce((p_value ->> 'new_users_only')::boolean, new_users_only),
      expires_at = nullif(p_value ->> 'expires_at', '')::timestamptz,
      active = coalesce((p_value ->> 'active')::boolean, active),
      note = left(nullif(btrim(coalesce(p_value ->> 'note', '')), ''), 300)
    where code = v_code
    returning * into after;
  end if;
  perform public.audit(case when before.code is null then 'PROMO_CREATED' else 'PROMO_UPDATED' end, null, p_note, 'promo:' || v_code, null,
    jsonb_build_object('before', case when before.code is not null then to_jsonb(before) end, 'after', to_jsonb(after)));
  return after;
end;
$$;
revoke all on function public.admin_save_promo(jsonb, text) from public, anon;
grant execute on function public.admin_save_promo(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Statement imports per plan (lifetime count; null = unlimited). FREE keeps 1.
-- ---------------------------------------------------------------------------
alter table public.plans add column if not exists max_statement_imports integer check (max_statement_imports is null or max_statement_imports >= 0);
update public.plans set max_statement_imports = 1 where code = 'FREE' and max_statement_imports is null;

alter table public.statement_import_credits add column if not exists used_count integer not null default 1;

do $$
declare
  def text := pg_get_functiondef('public.import_statement(uuid, jsonb, jsonb, boolean)'::regprocedure);
  old_block constant text := $old$  if public.plan_code_of(uid) = 'FREE' then
    -- The one free import: claimed atomically, refused once used.
    insert into public.statement_import_credits (user_id) values (uid) on conflict (user_id) do nothing;
    if not found then
      raise exception 'plan_required' using errcode = 'P0001';
    end if;
  end if;$old$;
  new_block constant text := $new$  -- Imports allowed by the plan (null = unlimited), counted for the account and
  -- claimed atomically with the import, so a failed import uses nothing.
  if (select p.max_statement_imports from public.plans p where p.code = public.plan_code_of(uid)) is not null then
    insert into public.statement_import_credits as c (user_id, used_count)
    select uid, 1 where (select p.max_statement_imports from public.plans p where p.code = public.plan_code_of(uid)) >= 1
    on conflict (user_id) do update set used_count = c.used_count + 1, used_at = now()
      where c.used_count < (select p.max_statement_imports from public.plans p where p.code = public.plan_code_of(uid));
    if not found then
      raise exception 'plan_required' using errcode = 'P0001';
    end if;
  end if;$new$;
begin
  if position('max_statement_imports' in def) = 0 then
    if position(old_block in def) = 0 then
      raise exception 'import_statement: free-import block not found';
    end if;
    execute replace(def, old_block, new_block);
  end if;
end $$;

-- admin_update_plan: the import limit is editable like the other nullable limits.
do $$
declare
  def text := pg_get_functiondef('public.admin_update_plan(text, jsonb, text)'::regprocedure);
begin
  if position('max_statement_imports' in def) = 0 then
    def := replace(def, 'array[''max_wallets'', ''max_family_members'', ''max_business_workspaces'']',
                        'array[''max_wallets'', ''max_family_members'', ''max_business_workspaces'', ''max_statement_imports'']');
    if position('max_statement_imports' in def) = 0 then
      raise exception 'admin_update_plan: limits list not found';
    end if;
    execute def;
  end if;
end $$;

select public.apply_security_gate();
