-- The app's real speed on members' phones (founder, 14/11/2026): one row per Web Vital a page view reported — the
-- screen's route (ids removed), the metric, its value and the kind of device; no person, no amount, no text
-- (src/lib/web-vitals.ts). Written by the server only (/api/vitals, service role); read only by a super admin, as the
-- 75th percentile per screen (admin_web_vitals). Kept 30 days.
create table if not exists public.web_vitals (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  route text not null check (char_length(route) between 1 and 80),
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0),
  device text not null check (device in ('apk', 'mobile', 'desktop'))
);
create index if not exists web_vitals_at_idx on public.web_vitals (at);
alter table public.web_vitals enable row level security;
revoke all on public.web_vitals from public, anon, authenticated;

-- The slowest screens first: p75 of each metric per route over the last p_days (at least 5 reports), worst LCP on top.
create or replace function public.admin_web_vitals(p_days int default 7)
returns table(route text, device text, metric text, p75 double precision, n bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select v.route, v.device, v.metric,
         percentile_cont(0.75) within group (order by v.value) as p75,
         count(*) as n
  from public.web_vitals v
  where v.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
  group by v.route, v.device, v.metric
  having count(*) >= 5
  order by v.route, v.device, v.metric;
end $$;
revoke all on function public.admin_web_vitals(int) from public, anon;
grant execute on function public.admin_web_vitals(int) to authenticated;

select public.apply_security_gate();
