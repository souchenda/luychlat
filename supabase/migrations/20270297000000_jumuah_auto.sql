-- The Friday Jumu'ah reminder publishes on its own (founder, 6/11/2026: «the Friday poster for the Islamic community can
-- post automatically, no tap needed — and a bit earlier, around 10:30, in case readers are not ready»): the same sourced
-- text every week, @LuyChlatIslamic only, so no card waits in «LCA Approval» (lib/scheduled-posts.ts AUTO_PUBLISH_KINDS
-- — the same list; the time is lib/islamic-channel.ts ISLAMIC_SCHEDULE). Additive.

create or replace function public.post_auto_publish(p_kind text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('BULLETIN', 'RATES', 'ISLAMIC_MORNING', 'ISLAMIC_BULLETIN', 'ISLAMIC_NIGHT', 'HOLYDAY', 'ISLAMIC_JUMUAH')
$$;
