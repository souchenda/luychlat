-- Seeing what the person sees (founder, 28/10/2026 — «I read 6 in front, they read 9 behind»): each person's version
-- and phone, the errors their phone meets, and a support code to find them by. Never a balance, an amount or a name in
-- any of it: the version, the device, the app's settings (lib/diagnostics.ts cleans every error before it is sent).

-- 1. The last version and phone of each account (one device per account — the single-session rule).
create table if not exists public.client_reports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  build text,
  apk_code integer,
  device jsonb not null default '{}'::jsonb
);
alter table public.client_reports enable row level security;
-- Read only by the person themself; super admins read through admin_client_reports().
drop policy if exists client_reports_own on public.client_reports;
create policy client_reports_own on public.client_reports for select to authenticated using (user_id = (select auth.uid()));
grant select on public.client_reports to authenticated;

create or replace function public.report_client(p_build text, p_apk integer, p_device jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if p_device is null or jsonb_typeof(p_device) <> 'object' or pg_column_size(p_device) > 2000 then
    raise exception 'bad device' using errcode = '22023';
  end if;
  insert into public.client_reports (user_id, seen_at, build, apk_code, device)
  values ((select auth.uid()), now(), left(p_build, 20), p_apk, p_device)
  on conflict (user_id) do update set seen_at = now(), build = excluded.build, apk_code = excluded.apk_code, device = excluded.device;
end;
$$;
revoke all on function public.report_client(text, integer, jsonb) from public, anon;
grant execute on function public.report_client(text, integer, jsonb) to authenticated;

-- 2. Errors met on phones (cleaned on the phone; capped here too), kept 30 days.
create table if not exists public.client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  build text,
  page text,
  message text not null,
  device jsonb not null default '{}'::jsonb
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);
alter table public.client_errors enable row level security;
-- No one reads it directly: super admins through admin_client_errors().

create or replace function public.log_client_error(p_build text, p_page text, p_message text, p_device jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if coalesce(trim(p_message), '') = '' then
    return;
  end if;
  -- Caps: 30 an hour per account; 300 an hour from signed-out pages (the sign-in page) in all.
  if v_user is not null then
    if (select count(*) from public.client_errors where user_id = v_user and at > now() - interval '1 hour') >= 30 then
      return;
    end if;
  elsif (select count(*) from public.client_errors where user_id is null and at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into public.client_errors (user_id, build, page, message, device)
  values (
    v_user, left(p_build, 20), left(p_page, 120), left(p_message, 300),
    case when p_device is not null and jsonb_typeof(p_device) = 'object' and pg_column_size(p_device) <= 2000 then p_device else '{}'::jsonb end
  );
  -- Now and then, the 30-day clean-up.
  if random() < 0.02 then
    delete from public.client_errors where at < now() - interval '30 days';
  end if;
end;
$$;
revoke all on function public.log_client_error(text, text, text, jsonb) from public;
grant execute on function public.log_client_error(text, text, text, jsonb) to anon, authenticated;

-- 3. For the super admin: the errors grouped by message (Control Center › System & bot) …
create or replace function public.admin_client_errors(p_hours integer default 24)
returns table (message text, page text, hits bigint, users bigint, last_at timestamptz, builds text[], device jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select e.message,
         (array_agg(e.page order by e.at desc))[1],
         count(*),
         count(distinct e.user_id),
         max(e.at),
         array_agg(distinct coalesce(e.build, '?')),
         (array_agg(e.device order by e.at desc))[1]
    from public.client_errors e
   where e.at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720))
   group by e.message
   order by max(e.at) desc
   limit 50;
end;
$$;
revoke all on function public.admin_client_errors(integer) from public, anon;
grant execute on function public.admin_client_errors(integer) to authenticated;

-- … and each customer's version and phone (Admin › Customers).
create or replace function public.admin_client_reports(p_user_ids uuid[])
returns table (user_id uuid, seen_at timestamptz, build text, apk_code integer, device jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select r.user_id, r.seen_at, r.build, r.apk_code, r.device from public.client_reports r where r.user_id = any (p_user_ids[1:200]);
end;
$$;
revoke all on function public.admin_client_reports(uuid[]) from public, anon;
grant execute on function public.admin_client_reports(uuid[]) to authenticated;

-- 4. Admin › Customers finds a person by the support code they read out (the rest as before).
create or replace function public.admin_customers(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, telegram_username text, provider text, joined_at timestamptz,
  last_active_at timestamptz, plan_code text, tier text, source text, period_end timestamptz, status text,
  last_paid_at timestamptz, last_payment_method text, last_payment_amount numeric, last_payment_currency text,
  paid_count integer, is_test boolean, suspended boolean, birth_date date, occupation text, account_status text, total bigint
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
      pp.occupation,
      coalesce(pr.account_status, 'ACTIVE') as account_status
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
        or replace(pr.phone, ' ', '') ilike '%' || replace(p_search, ' ', '') || '%'
        -- The support code a person reads out («LC-7F3K2A» — lib/diagnostics.ts): the first 6 characters of the id.
        or (p_search ~* '^\s*(lc-?)?[0-9a-f]{6}\s*$' and u.id::text like lower(substring(p_search from '(?i)([0-9a-f]{6})\s*$')) || '%'))
  ), filtered as (
    select * from rows r
    -- Dormant accounts (6+ months inactive) only under their own filter: the main lists stay active people.
    where case coalesce(p_filter, 'all')
      when 'dormant' then r.account_status = 'DORMANT'
      when 'paying' then r.account_status <> 'DORMANT' and r.status = 'ACTIVE' and r.source in ('KHQR', 'ADMIN') and not r.is_test
      when 'free' then r.account_status <> 'DORMANT' and r.status <> 'ACTIVE' and not r.is_test
      when 'test' then r.account_status <> 'DORMANT' and r.is_test
      else r.account_status <> 'DORMANT'
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
