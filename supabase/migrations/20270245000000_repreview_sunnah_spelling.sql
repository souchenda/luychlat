-- «ស៊ុណ្ណះ» (سُنَّة, with the visarga — founder, 21/10/2026): the waiting Thursday-fast reminder of 21 October was previewed
-- with «បួសស៊ុណ្ណា»; it is sent again to «LCA Approval» with the corrected poster and caption (REPREVIEW_READY
-- «sunnah-spelling» — only the new build acts on it), only while it still waits.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'sunnah-spelling')
 where kind = 'ISLAMIC_FAST' and post_key = '2026-10-21' and status = 'PENDING';
