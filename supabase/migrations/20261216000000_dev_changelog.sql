-- Super Admin › Development: what shipped on a day (from git, recorded by the
-- deploy) and the roadmap of what's next.
--
-- dev_changelog is filled by deploy/changelog-sync.sh after each successful
-- deploy (the server's git history: conventional-commit kind / scope /
-- subject); deployed_at is when that deploy finished (for the first backfill,
-- the commit time). dev_roadmap is kept by hand in the app. Super admins only;
-- roadmap changes are audited.

create table if not exists public.dev_changelog (
  hash         text primary key check (hash ~ '^[0-9a-f]{40}$'),
  committed_at timestamptz not null,
  deployed_at  timestamptz not null,
  kind         text not null default 'other',
  scope        text,
  subject      text not null,
  body         text
);
create index if not exists dev_changelog_deployed_idx on public.dev_changelog (deployed_at desc);
alter table public.dev_changelog enable row level security;
revoke all on public.dev_changelog from anon, authenticated;

create table if not exists public.dev_roadmap (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 2 and 200),
  details    text check (details is null or char_length(details) <= 2000),
  area       text not null default 'other' check (area ~ '^[a-z_]{2,20}$'),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'done', 'dropped')),
  priority   smallint not null default 2 check (priority between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at    timestamptz,
  created_by uuid references auth.users (id) on delete set null
);
alter table public.dev_roadmap enable row level security;
revoke all on public.dev_roadmap from anon, authenticated;

-- What shipped between two Cambodia dates (inclusive), newest first.
create or replace function public.dev_changelog_list(p_from date, p_to date)
returns table (hash text, deployed_at timestamptz, committed_at timestamptz, kind text, scope text, subject text, body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  return query
    select c.hash, c.deployed_at, c.committed_at, c.kind, c.scope, c.subject, c.body
      from public.dev_changelog c
     where (c.deployed_at at time zone 'Asia/Phnom_Penh')::date between p_from and p_to
     order by c.deployed_at desc, c.committed_at desc
     limit 1000;
end;
$$;

create or replace function public.dev_roadmap_list()
returns setof public.dev_roadmap
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
    select * from public.dev_roadmap r
     where r.status in ('todo', 'doing') or r.done_at > now() - interval '30 days' or r.updated_at > now() - interval '30 days'
     order by case r.status when 'doing' then 0 when 'todo' then 1 when 'done' then 2 else 3 end, r.priority, r.created_at;
end;
$$;

-- Add (no id) or change an item: {"id"?, "title"?, "details"?, "area"?, "status"?, "priority"?}.
create or replace function public.dev_roadmap_save(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_status text := p_item ->> 'status';
begin
  perform public.require_super_admin();
  if v_id is null then
    insert into public.dev_roadmap (title, details, area, status, priority, created_by)
    values (btrim(p_item ->> 'title'), nullif(btrim(coalesce(p_item ->> 'details', '')), ''), coalesce(nullif(p_item ->> 'area', ''), 'other'),
            coalesce(v_status, 'todo'), coalesce((p_item ->> 'priority')::smallint, 2), (select auth.uid()))
    returning id into v_id;
    perform public.audit('roadmap.add', null, left(p_item ->> 'title', 200), v_id::text);
  else
    update public.dev_roadmap set
      title = coalesce(nullif(btrim(p_item ->> 'title'), ''), title),
      details = case when p_item ? 'details' then nullif(btrim(coalesce(p_item ->> 'details', '')), '') else details end,
      area = coalesce(nullif(p_item ->> 'area', ''), area),
      status = coalesce(v_status, status),
      priority = coalesce((p_item ->> 'priority')::smallint, priority),
      done_at = case when v_status = 'done' then now() when v_status in ('todo', 'doing') then null else done_at end,
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'not found' using errcode = '22023';
    end if;
    perform public.audit('roadmap.update', null, concat_ws(' → ', (select title from public.dev_roadmap where id = v_id), v_status), v_id::text);
  end if;
  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.dev_changelog_list(date, date)', 'public.dev_roadmap_list()', 'public.dev_roadmap_save(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Today's open items (2026-10-06), so the roadmap starts complete.
insert into public.dev_roadmap (title, details, area, status, priority)
select v.title, v.details, v.area, 'todo', v.priority
  from (values
    ('Set the 32,000,000៛ OD on ACLEDA 386***6262 and reconcile the balance to 10,386,200៛',
     'Wallet ✏️ → OD limit; then Reconcile. Until then net worth is ~$8,000 too high.', 'wallets', 1::smallint),
    ('Put dl / test / luy.ibmserp.com behind Cloudflare (free plan)',
     'Lasting DDoS protection; the nginx flood guard (2026-10-07) only blocks the current pattern.', 'security', 1::smallint),
    ('Delete the test wallets តេស្ត and កាបូបតេស$ (Personal, archived, no transactions)',
     'Wallets › archived › wallet › ✏️ › លុប. ACLEDA 078***4222 holds 13 real-looking entries: keep it archived.', 'wallets', 3::smallint),
    ('Turn the bank_slips feature PUBLIC after testing',
     'Admin › Super › feature flags. Gemini quota is shared with voice and /ai (20 slips / chat / hour).', 'telegram', 2::smallint),
    ('Add an ABA wallet to DL MEAT SUPPLY',
     'ABA PayWay KHQR payments go to the KHR wallet until an ABA wallet exists.', 'wallets', 2::smallint),
    ('Back up the Android release keystore', 'Lives only on the server (deploy/build-apk.sh).', 'security', 2::smallint),
    ('Decide on Google sign-in and a service-role key', 'Open decisions from the account work.', 'accounts', 3::smallint)
  ) as v(title, details, area, priority)
 where not exists (select 1 from public.dev_roadmap);

-- ---------------------------------------------------------------------------
-- End-of-day report: at 23:59 (Cambodia) the day is finalized into a stored
-- snapshot (what shipped + the open roadmap) and sent to super admins in
-- Telegram. The page shows today live (00:00 → now) and past days with their
-- final snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.dev_eod_reports (
  day          date primary key,
  report       jsonb not null,
  finalized_at timestamptz not null default now()
);
alter table public.dev_eod_reports enable row level security;
revoke all on public.dev_eod_reports from anon, authenticated;

-- The day's content: commits deployed that Cambodia day, and the open roadmap.
create or replace function public.dev_eod_compile(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'commits', coalesce((select jsonb_agg(jsonb_build_object('hash', c.hash, 'kind', c.kind, 'scope', c.scope, 'subject', c.subject, 'deployed_at', c.deployed_at) order by c.deployed_at)
                         from public.dev_changelog c where (c.deployed_at at time zone 'Asia/Phnom_Penh')::date = p_day), '[]'::jsonb),
    'roadmap', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'area', r.area, 'status', r.status, 'priority', r.priority) order by case r.status when 'doing' then 0 else 1 end, r.priority, r.created_at)
                         from public.dev_roadmap r where r.status in ('todo', 'doing')), '[]'::jsonb),
    'done_today', coalesce((select jsonb_agg(r.title order by r.done_at) from public.dev_roadmap r
                            where r.status = 'done' and (r.done_at at time zone 'Asia/Phnom_Penh')::date = p_day), '[]'::jsonb)
  );
$$;
revoke all on function public.dev_eod_compile(date) from public, anon, authenticated;

-- Bot (23:59): finalize the day (stored once; later calls return the stored one).
create or replace function public.bot_dev_eod(p_key text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform public.require_bot(p_key);
  insert into public.dev_eod_reports (day, report) values (p_day, public.dev_eod_compile(p_day))
  on conflict (day) do nothing;
  select report into r from public.dev_eod_reports where day = p_day;
  return r;
end;
$$;

-- App: a past day's final snapshot (null for today / unfinalized days).
create or replace function public.dev_eod_report(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return (select jsonb_build_object('finalized_at', e.finalized_at, 'report', e.report) from public.dev_eod_reports e where e.day = p_day);
end;
$$;

revoke all on function public.bot_dev_eod(text, date) from public;
grant execute on function public.bot_dev_eod(text, date) to anon, authenticated;
revoke all on function public.dev_eod_report(date) from public, anon;
grant execute on function public.dev_eod_report(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Security & health for the daily report:
--   security_traffic — per minute, from Nginx's access log (deploy/security-stats.sh,
--     every 5 minutes on the Droplet): requests, dropped by the flood guard (444),
--     rate-limited (429), server errors (5xx). Sites with access_log off aren't counted.
--   health_incidents — from the watchdog: start, end (recovery), peak.
-- ---------------------------------------------------------------------------
create table if not exists public.security_traffic (
  minute  timestamptz primary key,
  total   integer not null default 0,
  blocked integer not null default 0,
  limited integer not null default 0,
  errors  integer not null default 0
);
alter table public.security_traffic enable row level security;
revoke all on public.security_traffic from anon, authenticated;

create table if not exists public.health_incidents (
  id         uuid primary key default gen_random_uuid(),
  issue      text not null check (issue ~ '^[a-z_]{2,20}$'),
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  peak       numeric(8, 1),
  note       text
);
create index if not exists health_incidents_started_idx on public.health_incidents (started_at desc);
create unique index if not exists health_incidents_open_idx on public.health_incidents (issue) where ended_at is null;
alter table public.health_incidents enable row level security;
revoke all on public.health_incidents from anon, authenticated;

-- Watchdog: 'open' (alert raised), 'peak' (while open), 'close' (recovered).
create or replace function public.bot_health_incident(p_key text, p_issue text, p_event text, p_value numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_event = 'open' then
    insert into public.health_incidents (issue, peak) values (p_issue, p_value)
    on conflict (issue) where ended_at is null do nothing;
  elsif p_event = 'peak' and p_value is not null then
    update public.health_incidents set peak = greatest(coalesce(peak, p_value), p_value) where issue = p_issue and ended_at is null;
  elsif p_event = 'close' then
    update public.health_incidents set ended_at = now() where issue = p_issue and ended_at is null;
  end if;
end;
$$;

-- Security & health between two Cambodia dates (inclusive).
create or replace function public.dev_security_compile(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select (p_from::timestamp at time zone 'Asia/Phnom_Penh') as t0, ((p_to + 1)::timestamp at time zone 'Asia/Phnom_Penh') as t1
  ), traffic as (
    select coalesce(sum(s.total), 0) as total, coalesce(sum(s.blocked), 0) as blocked, coalesce(sum(s.limited), 0) as limited,
           coalesce(sum(s.errors), 0) as errors, coalesce(max(s.blocked), 0) as peak_blocked_per_min,
           count(*) filter (where s.blocked > 0) as attack_minutes,
           min(s.minute) filter (where s.blocked > 0) as first_blocked, max(s.minute) filter (where s.blocked > 0) as last_blocked
      from public.security_traffic s, span where s.minute >= span.t0 and s.minute < span.t1
  ), samples as (
    select max(h.cpu_pct) as max_cpu, max(h.ram_pct) as max_ram, count(*) as n, count(*) filter (where h.ok) as ok_n
      from public.health_samples h, span where h.at >= span.t0 and h.at < span.t1
  )
  select jsonb_build_object(
    'traffic', (select to_jsonb(traffic) from traffic),
    'health', (select jsonb_build_object('max_cpu', max_cpu, 'max_ram', max_ram,
                 'ok_pct', case when n > 0 then round(ok_n * 100.0 / n, 1) end) from samples),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('issue', i.issue, 'started_at', i.started_at, 'ended_at', i.ended_at,
                   'minutes', round(extract(epoch from (coalesce(i.ended_at, now()) - i.started_at)) / 60), 'peak', i.peak, 'note', i.note) order by i.started_at)
                 from public.health_incidents i, span where i.started_at < span.t1 and coalesce(i.ended_at, now()) >= span.t0), '[]'::jsonb),
    'now', (select jsonb_build_object('at', h.at, 'ok', h.ok, 'cpu', h.cpu_pct, 'ram', h.ram_pct, 'issues', h.issues)
              from public.health_samples h order by h.at desc limit 1)
  );
$$;
revoke all on function public.dev_security_compile(date, date) from public, anon, authenticated;

create or replace function public.dev_security_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  return public.dev_security_compile(p_from, p_to);
end;
$$;

-- The end-of-day snapshot carries the day's security block too.
create or replace function public.bot_dev_eod(p_key text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform public.require_bot(p_key);
  insert into public.dev_eod_reports (day, report)
  values (p_day, public.dev_eod_compile(p_day) || jsonb_build_object('security', public.dev_security_compile(p_day, p_day)))
  on conflict (day) do nothing;
  select report into r from public.dev_eod_reports where day = p_day;
  return r;
end;
$$;

-- Host job (deploy/security-stats.sh) writes security_traffic directly with DATABASE_URL; no RPC needed.
revoke all on function public.bot_health_incident(text, text, text, numeric) from public;
grant execute on function public.bot_health_incident(text, text, text, numeric) to anon, authenticated;
revoke all on function public.dev_security_summary(date, date) from public, anon;
grant execute on function public.dev_security_summary(date, date) to authenticated;

-- Tonight's incident (before this table existed), from the health samples and the investigation.
insert into public.health_incidents (issue, started_at, ended_at, peak, note)
select 'cpu', '2026-10-07 00:05:00+07', '2026-10-07 00:16:00+07', 99.9,
       'HTTP flood (DDoS) "/?s=…&cb=…" on the PHP sites; Nginx flood guard added 00:16'
 where not exists (select 1 from public.health_incidents);
