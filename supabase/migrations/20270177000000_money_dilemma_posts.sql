-- «Money dilemmas» (founder, 18/10/2026): Tuesday / Friday 18:30 a real money situation and an open question for
-- @LuyChlatCommunity and the Facebook Page — previewed to the founder and published only when approved.
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY', 'DILEMMA',
                  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ',
                  'ISLAMIC_MORNING', 'ISLAMIC_IFTAR', 'ISLAMIC_NIGHT'));
