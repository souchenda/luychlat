-- The Coronation poster breathes (founder, 20/10/2026 — «too many letters … like an administrative letter»): two
-- spacious blessing lines on the graphic, the full palace paragraph in the caption. The card is withdrawn from
-- «LCA Approval» and sent again once by the build that knows the flag (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'short-blessing')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
