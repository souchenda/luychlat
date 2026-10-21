-- The fuel price poster (founder, 21/10/2026 — «text-only fuel posts get low reach»): the waiting announcement of MoC
-- notice #36200 is sent again to «LCA Approval» with its 1080 × 1080 poster (lib/server/fuel-poster.ts). The old text card
-- is withdrawn by the new build only (REPREVIEW_READY «fuel-poster»), and only while the post still waits.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'fuel-poster')
 where kind = 'FUEL' and post_key = 'notice-36200' and status = 'PENDING';
