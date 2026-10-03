-- Business metrics count customers only: staff accounts (support, admin,
-- super_admin) and their payments are left out of users, activity, paying
-- users, MRR, revenue, conversion and churn. Plus a customer directory for
-- /admin/super (staff left out the same way).

create or replace function public.is_staff_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = p_user_id);
$$;
revoke all on function public.is_staff_user(uuid) from public, anon, authenticated;

-- Paying = an active plan bought with money (KHQR, or entered by an admin after
-- payment) — not a trial, referral reward, promo code or an admin's own test plan.
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
  select count(*) into users_total from auth.users u where not public.is_staff_user(u.id);
  select count(*) into paying_now from public.subscriptions s
  where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN')
    and not public.is_staff_user(s.user_id);
  select count(*) into paying_then from public.subscriptions s
  where s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and s.current_period_start <= month_ago and s.current_period_end > month_ago
    and not public.is_staff_user(s.user_id);
  select count(*) into churned from public.subscriptions s
  where s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and s.current_period_start <= month_ago and s.current_period_end > month_ago
    and not (s.status = 'ACTIVE' and s.current_period_end > now())
    and not public.is_staff_user(s.user_id);
  return jsonb_build_object(
    'users', users_total,
    'staff_excluded', (select count(*) from public.app_admins),
    'dau', (select count(*) from auth.users u where not public.is_staff_user(u.id) and public.last_active_at(u.id) > now() - interval '1 day'),
    'mau', (select count(*) from auth.users u where not public.is_staff_user(u.id) and public.last_active_at(u.id) > month_ago),
    'new_30d', (select count(*) from auth.users u where not public.is_staff_user(u.id) and u.created_at > month_ago),
    'paying_users', paying_now,
    'paying_by_tier', (
      select coalesce(jsonb_object_agg(t.tier, t.n), '{}'::jsonb) from (
        select p.tier, count(*) as n from public.subscriptions s join public.plans p on p.code = s.plan_code
        where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN')
          and not public.is_staff_user(s.user_id)
        group by p.tier) t
    ),
    'trial_or_referral', (
      select count(*) from public.subscriptions s
      where s.status = 'ACTIVE' and s.current_period_end > now() and s.source in ('TRIAL', 'REFERRAL', 'PROMO') and not public.is_staff_user(s.user_id)
    ),
    'mrr_usd', (
      select coalesce(round(sum(p.price_usd * 30.0 / greatest(p.period_days, 1)), 2), 0) from public.subscriptions s join public.plans p on p.code = s.plan_code
      where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and not public.is_staff_user(s.user_id)
    ),
    'mrr_khr', (
      select coalesce(round(sum(p.price_khr * 30.0 / greatest(p.period_days, 1))), 0) from public.subscriptions s join public.plans p on p.code = s.plan_code
      where s.status = 'ACTIVE' and s.current_period_end > now() and s.plan_code <> 'FREE' and s.source in ('KHQR', 'ADMIN') and not public.is_staff_user(s.user_id)
    ),
    'revenue_total', (
      select coalesce(jsonb_object_agg(x.currency, x.total), '{}'::jsonb)
      from (select currency, sum(amount) as total from public.payments where status = 'PAID' and not public.is_staff_user(user_id) group by currency) x
    ),
    'revenue_30d', (
      select coalesce(jsonb_object_agg(x.currency, x.total), '{}'::jsonb)
      from (select currency, sum(amount) as total from public.payments where status = 'PAID' and reviewed_at > month_ago and not public.is_staff_user(user_id) group by currency) x
    ),
    'payments_30d', (select count(*) from public.payments where status = 'PAID' and reviewed_at > month_ago and not public.is_staff_user(user_id)),
    'conversion_pct', case when users_total > 0 then round(100.0 * paying_now / users_total, 1) end,
    'churn_30d_pct', case when paying_then > 0 then round(100.0 * churned / paying_then, 1) end,
    'churn_base', paying_then,
    'pending_payments', (select count(*) from public.payments where status = 'PENDING' and not public.is_staff_user(user_id))
  );
end;
$$;

-- Customer directory: account, Telegram, plan and payment metadata only (never finances).
--   filter: 'all' | 'paying' (active plan bought with money) | 'free' (no active plan)
create or replace function public.admin_customers(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, telegram_username text, joined_at timestamptz, last_active_at timestamptz,
  plan_code text, tier text, source text, period_end timestamptz, status text,
  last_paid_at timestamptz, last_payment_method text, last_payment_amount numeric, last_payment_currency text, paid_count integer,
  total bigint
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
      u.id as user_id, u.email::text as email, pr.display_name, tl.username as telegram_username, u.created_at as joined_at,
      public.last_active_at(u.id) as last_active_at,
      s.plan_code, coalesce(case when s.status = 'ACTIVE' and s.current_period_end > now() then p.tier end, 'FREE') as tier,
      s.source, s.current_period_end as period_end,
      case
        when s.status = 'ACTIVE' and s.current_period_end > now() then 'ACTIVE'
        when s.user_id is not null and s.plan_code <> 'FREE' then 'EXPIRED'
        else 'FREE'
      end as status,
      lp.reviewed_at as last_paid_at, lp.method as last_payment_method, lp.amount as last_payment_amount, lp.currency::text as last_payment_currency,
      (select count(*)::integer from public.payments x where x.user_id = u.id and x.status = 'PAID') as paid_count
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    left join public.telegram_links tl on tl.user_id = u.id
    left join public.subscriptions s on s.user_id = u.id
    left join public.plans p on p.code = s.plan_code
    left join lateral (
      select x.reviewed_at, x.method, x.amount, x.currency from public.payments x
      where x.user_id = u.id and x.status = 'PAID' order by x.reviewed_at desc nulls last limit 1
    ) lp on true
    where not public.is_staff_user(u.id)
      and (coalesce(p_search, '') = ''
        or u.email ilike '%' || p_search || '%'
        or pr.display_name ilike '%' || p_search || '%'
        or tl.username ilike '%' || p_search || '%')
  ), filtered as (
    select * from rows r
    where case coalesce(p_filter, 'all')
      when 'paying' then r.status = 'ACTIVE' and r.source in ('KHQR', 'ADMIN')
      when 'free' then r.status <> 'ACTIVE'
      else true
    end
  )
  select f.*, count(*) over () as total from filtered f
  order by (f.status = 'ACTIVE') desc, f.period_end asc nulls last, f.joined_at desc
  limit least(coalesce(p_limit, 30), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_customers(text, text, integer, integer) from public, anon;
grant execute on function public.admin_customers(text, text, integer, integer) to authenticated;
