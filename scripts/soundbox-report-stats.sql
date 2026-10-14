-- SoundBox announcement health (read-only). What the counter phones actually did for each payment,
-- from the steps the /soundbox page reports (soundbox_reports.log, e.g.
-- "visible chime km:timeout km:retry:spoken"). Change the window in `params` if needed.
--
--   ssh luychlat-prod "sh /tmp/q.sh" < scripts/soundbox-report-stats.sql
--
-- Step tokens: rx:<ms> (the phone got it this long after the server recorded it — phone clock) ·
-- live / poll (Realtime, or the 15 s backup check) · visible / hidden (the page then) · chime · melody ·
-- km:clips (recorded Khmer) · <lang>:spoken | timeout | silent-end | error:<code> (retry: = 2nd try) ·
-- ctx:<state> (audio held by the phone → «locked») · throw:… (an exception).

\set QUIET on
\pset footer off
create temp view sb as
with params as (select now() - interval '7 days' as since),
r as (
  select r.id, r.event_id, r.user_id, r.log, r.user_agent, r.created_at as reported_at,
         e.amount, e.currency, e.created_at as event_at, string_to_array(r.log, ' ') as steps
  from public.soundbox_reports r
  join public.soundbox_events e on e.id = r.event_id, params
  where r.created_at >= params.since
)
select r.*,
  (select s from unnest(r.steps) s where s in ('visible', 'hidden') limit 1) as screen,
  (select substring(s from '^rx:(\d+)$')::int from unnest(r.steps) s where s ~ '^rx:\d+$' limit 1) as rx_ms,
  (select s from unnest(r.steps) s where s in ('live', 'poll') limit 1) as via,
  'chime' = any(r.steps) as chimed,
  exists (select 1 from unnest(r.steps) s where s ~ '^(km|en|zh):(retry:)?spoken$' or s = 'km:clips') as spoke,
  (select substring(s from '^(km|en|zh)') from unnest(r.steps) s where s ~ '^(km|en|zh):(retry:)?spoken$' or s = 'km:clips' limit 1) as spoke_lang,
  exists (select 1 from unnest(r.steps) s where s ~ '^(km|en|zh):retry:spoken$') as spoke_on_retry,
  'melody' = any(r.steps) as melody,
  exists (select 1 from unnest(r.steps) s where s like 'ctx:%') as locked,
  exists (select 1 from unnest(r.steps) s where s like '%error:not-allowed%') as not_allowed,
  exists (select 1 from unnest(r.steps) s where s like 'throw:%') as threw,
  case when r.user_agent ~ 'iPhone|iPad' then 'iOS' when r.user_agent ~ 'Android' then 'Android' else 'other' end as platform,
  round(extract(epoch from r.reported_at - r.event_at)::numeric, 1) as delay_s
from r;
-- delay_s = recorded → report sent, i.e. INCLUDING the chime and the voice (a few seconds); rx_ms is the
-- receipt alone (reports from 1dcd565 on).

\echo '== 1. Outcome per announcement (last 7 days)'
select platform,
  count(*) as reports,
  count(*) filter (where spoke) as spoken,
  round(100.0 * count(*) filter (where spoke) / nullif(count(*), 0), 1) as spoken_pct,
  count(*) filter (where chimed and not spoke and not melody and not locked) as chime_only,
  count(*) filter (where melody) as melody_fallback,
  count(*) filter (where locked) as locked,
  count(*) filter (where spoke_on_retry) as saved_by_retry,
  count(*) filter (where not_allowed) as speech_not_allowed,
  count(*) filter (where threw) as errors
from sb group by rollup (platform) order by platform nulls last;

\echo '== 2. Speech vs fallback: which voice spoke'
select coalesce(spoke_lang, case when melody then '(melody)' when locked then '(locked)' else '(chime only)' end) as outcome,
  count(*), round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from sb group by 1 order by 2 desc;

\echo '== 3. Screen state when the payment arrived'
select screen, count(*), count(*) filter (where spoke) as spoken,
  round(100.0 * count(*) filter (where spoke) / nullif(count(*), 0), 1) as spoken_pct
from sb group by screen order by 2 desc;

\echo '== 4. Latency (seconds): bank → server, server → phone, server → announcement finished'
select platform,
  count(*) as reports,
  round(avg(rx_ms) / 1000.0, 1) as rx_avg_s,
  round((percentile_cont(0.5) within group (order by rx_ms) / 1000.0)::numeric, 1) as rx_p50_s,
  round((percentile_cont(0.95) within group (order by rx_ms) / 1000.0)::numeric, 1) as rx_p95_s,
  count(*) filter (where via = 'poll') as via_backup_check,
  round(avg(delay_s), 1) as done_avg_s,
  round(max(delay_s), 1) as done_max_s
from sb group by rollup (platform) order by platform nulls last;
-- Bank time (the bank's message; often to the minute) → recorded by the server. A late push (AUTOBOK
-- catching up) is announced as if new: «late_over_5min» lists how often.
with d as (
  select e.created_at, extract(epoch from e.created_at - t.transaction_date) as s
  from public.soundbox_events e join public.transactions t on t.id = e.transaction_id
  where e.created_at >= now() - interval '7 days')
select count(*) as events,
  round((percentile_cont(0.5) within group (order by s))::numeric, 1) as bank_to_server_p50_s,
  round((percentile_cont(0.95) within group (order by s))::numeric, 1) as bank_to_server_p95_s,
  round(avg(s)::numeric, 1) as bank_to_server_avg_s,
  count(*) filter (where s > 300) as late_over_5min
from d;
select created_at at time zone 'Asia/Phnom_Penh' as recorded_at, round(s / 60.0, 1) as minutes_late
from (select e.created_at, extract(epoch from e.created_at - t.transaction_date) as s
      from public.soundbox_events e join public.transactions t on t.id = e.transaction_id
      where e.created_at >= now() - interval '7 days') d
where s > 300 order by created_at desc limit 10;

\echo '== 5. Missed: payments no phone reported (page closed, asleep, the screen locked, or an old page)'
select e.created_at at time zone 'Asia/Phnom_Penh' as paid_at, e.amount, e.currency, w.name as business
from public.soundbox_events e join public.workspaces w on w.id = e.workspace_id
where e.created_at >= now() - interval '7 days'
  and not exists (select 1 from public.soundbox_reports r where r.event_id = e.id)
order by e.created_at desc limit 20;
select count(*) filter (where not exists (select 1 from public.soundbox_reports r where r.event_id = e.id)) as unreported,
  count(*) as soundbox_events,
  round(100.0 * count(*) filter (where exists (select 1 from public.soundbox_reports r where r.event_id = e.id)) / nullif(count(*), 0), 1) as reported_pct
from public.soundbox_events e where e.created_at >= now() - interval '7 days';

\echo '== 6. Missed earlier: KHQR sales recorded but never sent to the SoundBox (no soundbox_event)'
-- A sale (INCOME, Sales) from khqr_payments with no SoundBox event: the emit failed, or the sale came by a
-- path that doesn't emit (the bank-group listener, a held payment booked later — the latter by design).
select k.created_at at time zone 'Asia/Phnom_Penh' as recorded_at, k.bank, t.amount, t.currency, w.name as business,
  case when exists (select 1 from public.bot_held_payments h where h.transaction_id = t.id) then 'held, booked later (by design)' else 'not emitted' end as why
from public.khqr_payments k
join public.transactions t on t.id = k.transaction_id and t.type = 'INCOME'
join public.categories c on c.id = t.category_id and c.preset_key = 'sales'
join public.workspaces w on w.id = k.workspace_id
where k.created_at >= greatest(now() - interval '7 days', (select min(e.created_at) from public.soundbox_events e)) -- since the SoundBox existed
  and not exists (select 1 from public.soundbox_events e where e.transaction_id = t.id)
order by k.created_at desc limit 20;

\echo '== 7. Latest 20 announcements, step by step'
select reported_at at time zone 'Asia/Phnom_Penh' as at, platform, amount, currency, rx_ms, delay_s, log
from sb order by reported_at desc limit 20;
