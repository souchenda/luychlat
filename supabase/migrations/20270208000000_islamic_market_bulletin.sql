-- The Islamic market bulletin (founder, 20/10/2026): the NBC dollar rate, the Saudi riyal for Hajj and Umrah, gold and
-- the Zakat Nisab — daily on @LuyChlatIslamic only. Factual data from the agreed official sources, so it joins the
-- factual feeds that publish without a tap (lib/scheduled-posts.ts AUTO_PUBLISH_KINDS — the same list); every
-- creative post still waits for a person (ZERO UNAPPROVED PUBLIC POSTS).

alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check check (kind in (
  'MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY', 'DILEMMA',
  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ', 'ISLAMIC_MORNING', 'ISLAMIC_IFTAR', 'ISLAMIC_NIGHT',
  'ISLAMIC_BULLETIN'
));

create or replace function public.post_auto_publish(p_kind text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('BULLETIN', 'RATES', 'ISLAMIC_MORNING', 'ISLAMIC_BULLETIN')
$$;
