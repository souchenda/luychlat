-- /admin › Users: the user row also says whether the account is marked as a
-- test account (shown and switchable there for super admins).
drop function if exists public.admin_list_users(text, text, integer, integer);
create or replace function public.admin_list_users(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, joined_at timestamptz, last_active_at timestamptz,
  plan_code text, tier text, status text, period_end timestamptz, pending_payments integer,
  workspace_count integer, telegram_linked boolean, phone_verified boolean, mfa_enabled boolean,
  suspended boolean, suspended_reason text, require_2fa boolean, business_verified boolean, business_note text,
  is_test boolean,
  total bigint
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
      u.id as user_id, u.email::text as email, pr.display_name, u.created_at as joined_at, public.last_active_at(u.id) as last_active_at,
      s.plan_code,
      case when s.status = 'ACTIVE' and s.current_period_end > now() then (case when s.plan_code like 'ULTRA%' then 'ULTRA' else 'PRO' end) else 'FREE' end as tier,
      s.status, s.current_period_end as period_end,
      (select count(*)::integer from public.payments p where p.user_id = u.id and p.status = 'PENDING') as pending_payments,
      (select count(*)::integer from public.workspace_members m where m.user_id = u.id) as workspace_count,
      exists (select 1 from public.telegram_links l where l.user_id = u.id) as telegram_linked,
      u.phone_confirmed_at is not null as phone_verified,
      exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as mfa_enabled,
      c.suspended_at is not null as suspended, c.suspended_reason,
      coalesce(c.require_2fa, false) as require_2fa,
      c.business_verified_at is not null as business_verified, c.business_note,
      coalesce(c.is_test, false) as is_test
    from auth.users u
    left join public.subscriptions s on s.user_id = u.id
    left join public.profiles pr on pr.id = u.id
    left join public.account_controls c on c.user_id = u.id
    where coalesce(p_search, '') = ''
      or u.email ilike '%' || p_search || '%'
      or pr.display_name ilike '%' || p_search || '%'
      or u.id::text = p_search
  ), filtered as (
    select * from rows r
    where case coalesce(p_filter, 'all')
      when 'pro' then r.tier <> 'FREE'
      when 'free' then r.tier = 'FREE'
      when 'expiring' then r.tier <> 'FREE' and r.period_end <= now() + interval '7 days'
      when 'expired' then r.tier = 'FREE' and r.period_end is not null
      when 'pending' then r.pending_payments > 0
      when 'suspended' then r.suspended
      else true
    end
  )
  select f.*, count(*) over () as total from filtered f
  order by f.pending_payments desc, f.suspended desc, f.period_end asc nulls last, f.joined_at desc
  limit least(coalesce(p_limit, 50), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
