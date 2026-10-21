-- Posters show «app.luychlat.com» (founder, 21/10/2026 — Task #431: the shared footer read the bare «luychlat.com»). The
-- waiting #36200 fuel card is sent again with the corrected poster (REPREVIEW_READY «poster-website»), only while it
-- still waits. The fasting poster's own footer already reads «app.luychlat.com».
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'poster-website')
 where kind = 'FUEL' and post_key = 'notice-36200' and status = 'PENDING';
