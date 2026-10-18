-- The @LuyChlatIslamic 24-hour lifecycle (founder, 18/10/2026): the 05:30 waking du'a with the prayer times, the
-- 17:30 iftar du'a on fast days and the 21:00 bedtime du'a join the channel's posts — previewed to the founder and
-- published only when approved (bot_post_take), like every post.
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY',
                  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ',
                  'ISLAMIC_MORNING', 'ISLAMIC_IFTAR', 'ISLAMIC_NIGHT'));
