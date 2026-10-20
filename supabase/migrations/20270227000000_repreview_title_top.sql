-- The occasion first (founder, 20/10/2026 — «move the grand occasion title to the TOP CENTER above the King's
-- portrait»): the gold title at the top centre between the corner ornaments, the portrait in the arch, then the royal
-- name, the date chip and the full palace blessing, the brand at the base. The card is withdrawn from «LCA Approval» and
-- sent again once (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'title-top')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
