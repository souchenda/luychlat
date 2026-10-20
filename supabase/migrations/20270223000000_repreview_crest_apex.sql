-- The Royal Coat of Arms as the apex (founder, 20/10/2026 — «floating it on the upper right collides with the corner
-- ornament and breaks the symmetrical balance»): top centre above the arch, 15 % larger. The Coronation card is
-- withdrawn from «LCA Approval» and sent again once by the build that knows the flag (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'crest-apex')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
