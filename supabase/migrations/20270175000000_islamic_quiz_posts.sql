-- The @LuyChlatIslamic quiz (founder, 18/10/2026): a Telegram quiz poll on Tuesdays and Saturdays at noon,
-- previewed to the founder and published only when approved (the same scheduled_posts gate as every post).
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY',
                  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ'));
