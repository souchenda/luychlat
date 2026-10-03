-- System health watchdog: the server samples its own health every minute and
-- stores one row every 5 minutes; alerts and the weekly summary go to admins
-- who linked the official bot. All through bot_* functions (bot key), like the
-- rest of the server: no master database key.

create table if not exists public.health_samples (
  at        timestamptz primary key default now(),
  ok        boolean not null,
  ram_pct   numeric(5, 1),
  cpu_pct   numeric(5, 1),
  disk_pct  numeric(5, 1),
  app_mem_pct numeric(5, 1),
  db_ms     integer,
  tg_ms     integer,
  issues    text[] not null default '{}'
);
alter table public.health_samples enable row level security;
revoke all on public.health_samples from anon, authenticated;

-- Also the database ping: the call itself is the round trip being measured.
create or replace function public.bot_record_health(p_key text, p_sample jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_sample is null then
    return;
  end if;
  insert into public.health_samples (ok, ram_pct, cpu_pct, disk_pct, app_mem_pct, db_ms, tg_ms, issues)
  values (
    coalesce((p_sample ->> 'ok')::boolean, false),
    (p_sample ->> 'ram_pct')::numeric, (p_sample ->> 'cpu_pct')::numeric, (p_sample ->> 'disk_pct')::numeric,
    (p_sample ->> 'app_mem_pct')::numeric, (p_sample ->> 'db_ms')::integer, (p_sample ->> 'tg_ms')::integer,
    coalesce(array(select jsonb_array_elements_text(p_sample -> 'issues')), '{}')
  )
  on conflict (at) do nothing;
  delete from public.health_samples where at < now() - interval '35 days';
end;
$$;

-- A cheap round trip for the latency check.
create or replace function public.bot_ping(p_key text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return now();
end;
$$;

-- Weekly numbers: uptime = healthy 5-minute slots / slots in the period
-- (a slot without a sample means the server wasn't running).
create or replace function public.bot_health_summary(p_key text, p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 31)));
  slots integer := greatest(1, least(p_days, 31)) * 24 * 12;
begin
  perform public.require_bot(p_key);
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

-- Where alerts go: admins who linked the official bot.
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
    join public.app_admins a on a.user_id = l.user_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_record_health(text, jsonb)',
    'public.bot_ping(text)',
    'public.bot_health_summary(text, integer)',
    'public.bot_admin_chats(text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
