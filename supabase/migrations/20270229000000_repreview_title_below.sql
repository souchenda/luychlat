-- The occasion's title back under the portrait (founder, 20/10/2026 — «try putting the coronation title back under the
-- photo»): the smaller portrait raised, then the title, the royal name, the date chip, the blessing, the brand. The card
-- is withdrawn from «LCA Approval» and sent again once (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'title-below')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
