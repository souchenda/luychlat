-- National days and royal ceremonies (founder, 20/10/2026 — «LuyChlat was silent on 15 October»): a commemoration
-- poster per day (lib/calendar/cambodia-holidays.ts), previewed in «LCA Approval» from 48 hours before at 08:00 and
-- published at 07:00 on the day to the community channel and the Page — only after an approver's tap. Not a factual
-- feed: it is never on the auto-publish list (post_auto_publish stays BULLETIN, RATES, ISLAMIC_MORNING, ISLAMIC_BULLETIN).
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check check (kind in (
  'MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY', 'DILEMMA',
  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ', 'ISLAMIC_MORNING', 'ISLAMIC_IFTAR', 'ISLAMIC_NIGHT',
  'ISLAMIC_BULLETIN', 'NATIONAL_DAY'
));
