-- Inactive accounts: after 180 days without activity (public.last_active_at:
-- app opens, sign-ins, new entries) an account becomes DORMANT — its sessions
-- end and its data is closed (account_ok) until the person reactivates it:
-- with a Telegram code when Telegram is linked, otherwise with a fresh
-- sign-in. At 150 days a friendly Telegram nudge goes out once. DELETED is
-- reserved (deleted accounts are removed outright). Staff never go dormant.

alter table public.profiles add column if not exists account_status text not null default 'ACTIVE';
alter table public.profiles add column if not exists dormant_since timestamptz;
alter table public.profiles add column if not exists dormancy_warned_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_status_check') then
    alter table public.profiles add constraint profiles_account_status_check check (account_status in ('ACTIVE', 'DORMANT', 'DELETED'));
  end if;
end $$;
-- (No UPDATE grant on these columns: only the functions below change them.)

-- Every data request already passes account_ok(): a dormant account gets nothing.
create or replace function public.account_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.account_controls c
    where c.user_id = (select auth.uid())
      and (c.suspended_at is not null or (c.require_2fa and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'))
  )
  and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'DORMANT'
  );
$$;

-- The app's check on launch (works while dormant: no data access needed).
create or replace function public.my_account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', coalesce((select p.account_status from public.profiles p where p.id = (select auth.uid())), 'ACTIVE'),
    'telegram', exists (select 1 from public.telegram_links l where l.user_id = (select auth.uid()))
  )
$$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

-- Server (bot key), once a day: put 180-day-inactive accounts to sleep (and end
-- their sessions), and return the 150-day ones to nudge on Telegram (once per
-- quiet spell).
create or replace function public.bot_dormancy_run(p_key text)
returns table (chat_id bigint, language text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);

  with sleepy as (
    update public.profiles p
    set account_status = 'DORMANT', dormant_since = now()
    from auth.users u
    where u.id = p.id
      and p.account_status = 'ACTIVE'
      and not public.is_staff_user(p.id)
      and coalesce(public.last_active_at(p.id), u.created_at) < now() - interval '180 days'
    returning p.id
  )
  delete from auth.sessions s using sleepy where s.user_id = sleepy.id;

  return query
    with due as (
      update public.profiles p
      set dormancy_warned_at = now()
      from auth.users u
      where u.id = p.id
        and p.account_status = 'ACTIVE'
        and not public.is_staff_user(p.id)
        and coalesce(public.last_active_at(p.id), u.created_at) < now() - interval '150 days'
        and (p.dormancy_warned_at is null or p.dormancy_warned_at < coalesce(public.last_active_at(p.id), u.created_at))
        and exists (select 1 from public.telegram_links l where l.user_id = p.id)
      returning p.id, p.display_name
    )
    select l.chat_id, l.language, due.display_name
    from due join public.telegram_links l on l.user_id = due.id;
end;
$$;
revoke all on function public.bot_dormancy_run(text) from public;
grant execute on function public.bot_dormancy_run(text) to anon, authenticated;

-- Wake my account up: with a grant from a Telegram code (reset_verify_code)
-- when Telegram is linked; otherwise with a sign-in in the last 5 minutes.
create or replace function public.reactivate_dormant(p_grant text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  linked boolean;
  fresh boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid and account_status = 'DORMANT') then
    return;
  end if;
  linked := exists (select 1 from public.telegram_links where user_id = uid);
  if linked then
    update public.password_resets
    set used_at = now(), grant_hash = null
    where user_id = uid and grant_hash = public.reset_hash(coalesce(p_grant, '')) and used_at is null and grant_expires_at > now();
    if not found then
      raise exception 'invalid_grant' using errcode = '22023';
    end if;
  else
    select exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
      where (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300
    ) into fresh;
    if not fresh then
      raise exception 'reauth_required' using errcode = '42501';
    end if;
  end if;
  update public.profiles
  set account_status = 'ACTIVE', dormant_since = null, dormancy_warned_at = null, last_seen_at = now()
  where id = uid;
end;
$$;
revoke all on function public.reactivate_dormant(text) from public, anon;
grant execute on function public.reactivate_dormant(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Super admin customers: + account_status; dormant ones only under "dormant".
-- ---------------------------------------------------------------------------
drop function if exists public.admin_customers(text, text, integer, integer);
create function public.admin_customers(p_search text, p_filter text, p_limit integer, p_offset integer)
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
        or replace(pr.phone, ' ', '') ilike '%' || replace(p_search, ' ', '') || '%')
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
