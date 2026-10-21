-- The fuel poster polished (founder, 21/10/2026 — Task #429): the badge's arrow is drawn (the «▼» glyph was an empty box
-- on the server), and the caption ends with the standard compact footer and «#តម្លៃប្រេង» instead of «✨ ចុះឈ្មោះ… 👇👇».
-- The waiting #36200 card is sent again with both (REPREVIEW_READY «fuel-poster-v2»), only while it still waits.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'fuel-poster-v2')
 where kind = 'FUEL' and post_key = 'notice-36200' and status = 'PENDING';
