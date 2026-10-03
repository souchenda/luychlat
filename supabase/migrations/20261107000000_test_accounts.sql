-- Internal / test accounts: a super admin can mark a customer account as a
-- test account. Like staff, test accounts are left out of business metrics;
-- they stay in the customer list with a 🧪 badge so the mark can be undone.
-- The customer list also gains the sign-up provider and account status.

alter table public.account_controls add column if not exists is_test boolean not null default false;
alter table public.account_controls add column if not exists test_note text check (test_note is null or char_length(test_note) <= 300);

-- Left out of business metrics: staff (any role) and accounts marked as test.
create or replace function public.is_internal_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = p_user_id)
      or exists (select 1 from public.account_controls c where c.user_id = p_user_id and c.is_test);
$$;
revoke all on function public.is_internal_user(uuid) from public, anon, authenticated;

-- Metrics: staff and test accounts out (and say how many test accounts).
do $$
declare
  def text := pg_get_functiondef('public.admin_exec_metrics()'::regprocedure);
begin
  if position('is_internal_user' in def) = 0 then
    def := replace(def, 'public.is_staff_user(', 'public.is_internal_user(');
    def := replace(def, '''staff_excluded'', (select count(*) from public.app_admins),',
      '''staff_excluded'', (select count(*) from public.app_admins),
    ''test_excluded'', (select count(*) from public.account_controls c where c.is_test and not exists (select 1 from public.app_admins a where a.user_id = c.user_id)),');
    if position('test_excluded' in def) = 0 then
      raise exception 'admin_exec_metrics: staff_excluded not found';
    end if;
    execute def;
  end if;
end $$;

drop function if exists public.admin_customers(text, text, integer, integer);
create or replace function public.admin_customers(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, telegram_username text, provider text, joined_at timestamptz, last_active_at timestamptz,
  plan_code text, tier text, source text, period_end timestamptz, status text,
  last_paid_at timestamptz, last_payment_method text, last_payment_amount numeric, last_payment_currency text, paid_count integer,
  is_test boolean, suspended boolean,
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
      c.suspended_at is not null as suspended
    from auth.users u
    left join public.profiles pr on pr.id = u.id
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
        or tl.username ilike '%' || p_search || '%')
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

create or replace function public.admin_set_test_account(p_user_id uuid, p_on boolean, p_note text)
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
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user not found' using errcode = '22023';
  end if;
  insert into public.account_controls (user_id, is_test, test_note)
  values (p_user_id, p_on, case when p_on then left(btrim(p_note), 300) end)
  on conflict (user_id) do update set is_test = excluded.is_test, test_note = excluded.test_note, updated_at = now();
  perform public.audit(case when p_on then 'ACCOUNT_MARKED_TEST' else 'ACCOUNT_UNMARKED_TEST' end, p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_test_account(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_test_account(uuid, boolean, text) to authenticated;
