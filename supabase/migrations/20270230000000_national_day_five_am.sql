-- National days publish at 05:00 (founder, 20/10/2026 — the poster lives one day; at 05:00 it is already at the top of
-- the feed when people wake at 05:30–06:00). The waiting Coronation post moves from 07:00 to 05:00 on 29 October, and
-- its card in «LCA Approval» is withdrawn and sent again once, naming the day: «ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក».
update public.scheduled_posts
   set publish_at = timestamptz '2026-10-29 05:00:00+07',
       payload = payload || jsonb_build_object('repreview', 'five-am')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status in ('PENDING', 'APPROVED');
