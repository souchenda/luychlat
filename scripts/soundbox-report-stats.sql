-- SoundBox announcement health (read-only). What the counter phones actually did for each payment,
-- from the steps the /soundbox page reports (soundbox_reports.log, e.g.
-- "visible chime km:timeout km:retry:spoken"). Change the window in `params` if needed.
--
--   ssh luychlat-prod "sh /tmp/q.sh" < scripts/soundbox-report-stats.sql
--
-- Step tokens: 1st = visible / hidden (the page when the payment arrived) · chime · melody ·
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
  r.steps[1] as screen,
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

\echo '== 4. Payments no phone reported (page closed, asleep, or the screen locked)'
select e.created_at at time zone 'Asia/Phnom_Penh' as paid_at, e.amount, e.currency, w.name as business
from public.soundbox_events e join public.workspaces w on w.id = e.workspace_id
where e.created_at >= now() - interval '7 days'
  and not exists (select 1 from public.soundbox_reports r where r.event_id = e.id)
order by e.created_at desc limit 20;

\echo '== 5. Latest 20 announcements, step by step'
select reported_at at time zone 'Asia/Phnom_Penh' as at, platform, amount, currency, delay_s, log
from sb order by reported_at desc limit 20;
