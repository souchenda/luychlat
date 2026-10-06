-- 1. New sign-ups → a Telegram note to the super admins (queued here by a
--    trigger, sent by the bot dispatcher: signing up never waits on Telegram).
-- 2. Optional date of birth and occupation — in an owner-only table, because
--    profiles rows are readable by family-workspace members.
-- 3. Birthday wishes at 08:00 Phnom Penh time (bot) and a banner in the app.

-- ---------------------------------------------------------------------------
-- 2. Private profile details (owner only; admins via admin_customers)
-- ---------------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  birth_date date check (birth_date is null or birth_date between date '1900-01-01' and date '2100-01-01'),
  occupation text check (occupation is null or occupation in ('STUDENT', 'EMPLOYEE', 'BUSINESS_OWNER', 'GENERAL')),
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;
drop policy if exists profile_private_select on public.profile_private;
create policy profile_private_select on public.profile_private for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profile_private_insert on public.profile_private;
create policy profile_private_insert on public.profile_private for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists profile_private_update on public.profile_private;
create policy profile_private_update on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists profile_private_delete on public.profile_private;
create policy profile_private_delete on public.profile_private for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 1. Sign-up alerts
-- ---------------------------------------------------------------------------
create table if not exists public.signup_alerts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table public.signup_alerts enable row level security;
revoke all on public.signup_alerts from anon, authenticated;

-- Never blocks or fails a sign-up.
create or replace function public.queue_signup_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.signup_alerts (user_id) values (new.id) on conflict do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_signup_alert on auth.users;
create trigger on_auth_user_signup_alert
  after insert on auth.users
  for each row execute function public.queue_signup_alert();

-- New accounts not announced yet (last 2 days), with how they signed up.
create or replace function public.bot_signup_alerts_pending(p_key text)
returns table (user_id uuid, email text, provider text, created_at timestamptz, total_members bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select u.id, u.email::text,
      case
        when public.is_phone_login_email(u.email) then 'phone'
        else coalesce(u.raw_app_meta_data ->> 'provider', 'email')
      end,
      u.created_at,
      (select count(*) from auth.users)
    from public.signup_alerts a
    join auth.users u on u.id = a.user_id
    where a.sent_at is null and a.created_at > now() - interval '2 days'
    order by a.created_at
    limit 20;
end;
$$;

create or replace function public.bot_signup_alert_sent(p_key text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.signup_alerts set sent_at = now() where user_id = p_user_id;
end;
$$;

-- Where admin notes go: the Telegram chats linked by super admins.
create or replace function public.bot_admin_chats(p_key text)
returns table (chat_id bigint, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.chat_id, l.language
    from public.telegram_links l
    join public.app_admins a on a.user_id = l.user_id and a.role = 'super_admin';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Birthdays: people born on this month and day (29 Feb on 28 Feb in other years)
--    with Telegram linked.
-- ---------------------------------------------------------------------------
create or replace function public.bot_birthday_people(p_key text, p_day date)
returns table (user_id uuid, chat_id bigint, language text, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  leap boolean := extract(day from (date_trunc('year', p_day) + interval '2 months' - interval '1 day')) = 29;
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language, pr.display_name
    from public.profile_private pp
    join public.telegram_links l on l.user_id = pp.user_id
    left join public.profiles pr on pr.id = pp.user_id
    where pp.birth_date is not null
      and (
        (extract(month from pp.birth_date) = extract(month from p_day) and extract(day from pp.birth_date) = extract(day from p_day))
        or (not leap and extract(month from p_day) = 2 and extract(day from p_day) = 28
            and extract(month from pp.birth_date) = 2 and extract(day from pp.birth_date) = 29)
      )
      and not exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_signup_alerts_pending(text)',
    'public.bot_signup_alert_sent(text, uuid)',
    'public.bot_admin_chats(text)',
    'public.bot_birthday_people(text, date)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Super admin customer list: + date of birth and occupation (and search by phone).
-- ---------------------------------------------------------------------------
drop function if exists public.admin_customers(text, text, integer, integer);
create function public.admin_customers(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, telegram_username text, provider text, joined_at timestamptz,
  last_active_at timestamptz, plan_code text, tier text, source text, period_end timestamptz, status text,
  last_paid_at timestamptz, last_payment_method text, last_payment_amount numeric, last_payment_currency text,
  paid_count integer, is_test boolean, suspended boolean, birth_date date, occupation text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  with rows as (
    select
      u.id as user_id, u.email::text as email, pr.display_name, tl.username as telegram_username,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
      u.created_at as joined_at, public.last_active_at(u.id) as last_active_at,
      s.plan_code, coalesce(case when s.status = 'ACTIVE' and s.current_period_end > now() then p.tier end, 'FREE') as tier,
      s.source, s.current_period_end as period_end,
      case
        when s.status = 'ACTIVE' and s.current_period_end > now() then 'ACTIVE'
        when s.user_id is not null and s.plan_code <> 'FREE' then 'EXPIRED'
        else 'FREE'
      end as status,
      lp.reviewed_at as last_paid_at, lp.method as last_payment_method, lp.amount as last_payment_amount, lp.currency::text as last_payment_currency,
      (select count(*)::integer from public.payments x where x.user_id = u.id and x.status = 'PAID') as paid_count,
      coalesce(c.is_test, false) as is_test,
      c.suspended_at is not null as suspended,
      pp.birth_date,
      pp.occupation
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    left join public.profile_private pp on pp.user_id = u.id
    left join public.telegram_links tl on tl.user_id = u.id
    left join public.subscriptions s on s.user_id = u.id
    left join public.plans p on p.code = s.plan_code
    left join public.account_controls c on c.user_id = u.id
    left join lateral (
      select x.reviewed_at, x.method, x.amount, x.currency from public.payments x
      where x.user_id = u.id and x.status = 'PAID' order by x.reviewed_at desc nulls last limit 1
    ) lp on true
    where not public.is_staff_user(u.id)
      and (coalesce(p_search, '') = ''
        or u.email ilike '%' || p_search || '%'
        or pr.display_name ilike '%' || p_search || '%'
        or tl.username ilike '%' || p_search || '%'
        or replace(pr.phone, ' ', '') ilike '%' || replace(p_search, ' ', '') || '%')
  ), filtered as (
    select * from rows r
    where case coalesce(p_filter, 'all')
      when 'paying' then r.status = 'ACTIVE' and r.source in ('KHQR', 'ADMIN') and not r.is_test
      when 'free' then r.status <> 'ACTIVE' and not r.is_test
      when 'test' then r.is_test
      else true
    end
  )
  select f.*, count(*) over () as total from filtered f
  order by f.is_test, (f.status = 'ACTIVE') desc, f.period_end asc nulls last, f.joined_at desc
  limit least(coalesce(p_limit, 30), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_customers(text, text, integer, integer) from public, anon;
grant execute on function public.admin_customers(text, text, integer, integer) to authenticated;

select public.apply_security_gate();
