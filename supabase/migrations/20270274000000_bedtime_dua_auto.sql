-- The bedtime du'a publishes on its own (founder, 28/10/2026: «the same du'a every night, and I approve the same thing
-- every night — set it to auto»): two nights a week (Tuesday / Saturday, every night of Ramadan — lib/islamic-channel.ts
-- NIGHT_DAYS), the app's sourced du'a, @LuyChlatIslamic only. It joins the list that publishes without a tap
-- (lib/scheduled-posts.ts AUTO_PUBLISH_KINDS — the same list); every other creative post still waits for a person.

create or replace function public.post_auto_publish(p_kind text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('BULLETIN', 'RATES', 'ISLAMIC_MORNING', 'ISLAMIC_BULLETIN', 'ISLAMIC_NIGHT')
$$;
