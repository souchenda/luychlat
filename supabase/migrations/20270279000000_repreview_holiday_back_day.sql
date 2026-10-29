-- 30 October, the day back after the Coronation (founder, 29/10/2026): the waiting card showed the old poster — the
-- pill «ថ្ងៃឈប់សម្រាក» and the chip «29 តុលា · ឈប់សម្រាក 1 ថ្ងៃ» on a working day, and «សូមស្វាគមន៍មកកាន់ការពិតវិញ».
-- A redrawn card only edits the caption, so the card is withdrawn and sent again with the new poster («ចូលធ្វើការវិញ ·
-- ថ្ងៃសុក្រ 30 តុលា», REPREVIEW_READY «holiday-back-day»), only while it still waits for the founder's tap.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'holiday-back-day')
 where kind = 'HOLIDAY' and post_key = '2026-10-30-post' and status = 'PENDING';
