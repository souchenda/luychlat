-- /admin › System health & bot security: a small server event log, and one
-- admin-only function that gathers the status the dashboard shows.

-- Server events (feed failures, bulletins, alerts, rejected webhook calls…).
-- Written by the server through the bot key; read by admins only.
create table if not exists public.server_events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  level   text not null check (level in ('info', 'warn', 'error', 'security')),
  source  text not null check (char_length(source) between 1 and 40),
  message text not null check (char_length(message) <= 300),
  -- Repeats folded into one row by the server (e.g. 37 rejected calls in 10 minutes).
  count   integer not null default 1 check (count >= 1)
);
create index if not exists server_events_at_idx on public.server_events (at desc);
alter table public.server_events enable row level security;
revoke all on public.server_events from anon, authenticated;

create or replace function public.bot_log_event(p_key text, p_level text, p_source text, p_message text, p_count integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.server_events (level, source, message, count)
  values (p_level, left(p_source, 40), left(coalesce(p_message, ''), 300), greatest(1, coalesce(p_count, 1)));
  delete from public.server_events where at < now() - interval '30 days';
end;
$$;
revoke all on function public.bot_log_event(text, text, text, text, integer) from public;
grant execute on function public.bot_log_event(text, text, text, text, integer) to anon, authenticated;

-- Everything the dashboard needs from the database, for admins (live session + 2FA).
create or replace function public.admin_system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - interval '7 days';
begin
  if not public.is_admin() or not public.access_ok() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'now', now(),
    'latest_sample', (select to_jsonb(h) from public.health_samples h order by h.at desc limit 1),
    -- Healthy 5-minute slots since monitoring began (at most 7 days back).
    'uptime_7d', (
      select round(100.0 * least(count(*) filter (where h.ok), slots) / slots, 2)
      from public.health_samples h,
           lateral (select greatest(1, ceil(extract(epoch from now() - greatest(since, (select min(x.at) from public.health_samples x))) / 300))::int as slots) n
      where h.at >= since
      group by n.slots
    ),
    'samples_7d', (select count(*) from public.health_samples h where h.at >= since),
    'bulletin_runs', coalesce((
      select jsonb_agg(jsonb_build_object('day', r.day, 'ran_at', r.ran_at) order by r.day desc)
      from (select * from public.bot_daily_runs where job = 'community-bulletin' order by day desc limit 7) r
    ), '[]'::jsonb),
    'weekly_health_last', (select max(ran_at) from public.bot_daily_runs where job = 'weekly-health'),
    'bot', (select jsonb_build_object('username', c.username, 'activated_at', c.updated_at) from public.bot_config c limit 1),
    'linked_chats', (select count(*) from public.telegram_links),
    'admins_linked', (select count(*) from public.telegram_links l join public.app_admins a on a.user_id = l.user_id),
    'market_updated_at', (select s.updated_at from public.app_settings s where s.key = 'market_live'),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.at desc) from (select * from public.server_events order by at desc limit 25) e
    ), '[]'::jsonb),
    'security_24h', (select coalesce(sum(count), 0) from public.server_events where level = 'security' and at >= now() - interval '24 hours'),
    'errors_24h', (select coalesce(sum(count), 0) from public.server_events where level = 'error' and at >= now() - interval '24 hours')
  );
end;
$$;
revoke all on function public.admin_system_status() from public, anon;
grant execute on function public.admin_system_status() to authenticated;

-- Weekly summary: the same uptime basis (since monitoring began, at most the period).
create or replace function public.bot_health_summary(p_key text, p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 31)));
  slots integer;
begin
  perform public.require_bot(p_key);
  slots := greatest(1, ceil(extract(epoch from now() - greatest(since, coalesce((select min(x.at) from public.health_samples x), now()))) / 300))::int;
  return (
    select jsonb_build_object(
      'samples', count(*),
      'slots', slots,
      'healthy', count(*) filter (where s.ok),
      'uptime_pct', round(100.0 * least(count(*) filter (where s.ok), slots) / slots, 2),
      'avg_db_ms', round(avg(s.db_ms)),
      'p95_db_ms', round((percentile_cont(0.95) within group (order by s.db_ms))::numeric),
      'avg_tg_ms', round(avg(s.tg_ms)),
      'max_ram_pct', max(s.ram_pct),
      'avg_ram_pct', round(avg(s.ram_pct), 1),
      'max_cpu_pct', max(s.cpu_pct),
      'avg_cpu_pct', round(avg(s.cpu_pct), 1),
      'last_disk_pct', (select h.disk_pct from public.health_samples h order by h.at desc limit 1),
      'issues', coalesce((select jsonb_agg(distinct i) from public.health_samples h, unnest(h.issues) i where h.at >= since), '[]'::jsonb)
    )
    from public.health_samples s
    where s.at >= since
  );
end;
$$;

select public.apply_security_gate();
