-- «ធ្លាប់ទេ?» (founder, 29/10/2026): a weekly post — a money pain the reader knows, and what App Luy Chlat does about it —
-- on Wednesday 18:30 to the community channel and the Facebook Page (lib/familiar.ts). Creative: previewed in «LCA
-- Approval» and published only on the founder's ✅ / 🚀 — never on the auto-publish list (post_auto_publish unchanged).
-- The kind list only grows: every kind the running version writes stays allowed.

alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check check (kind in (
  'MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY', 'DILEMMA',
  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH', 'ISLAMIC_QUIZ', 'ISLAMIC_MORNING', 'ISLAMIC_IFTAR', 'ISLAMIC_NIGHT',
  'ISLAMIC_BULLETIN', 'NATIONAL_DAY', 'FAMILIAR'
));
