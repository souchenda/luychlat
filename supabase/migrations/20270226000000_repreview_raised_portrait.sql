-- The final Coronation composition (founder, 20/10/2026): the kbach backdrop with its four golden corners, no crest, the
-- portrait raised into the space the crest left, and an open lower half (the two-line blessing between the date chip and
-- the corner ornaments). The card is withdrawn from «LCA Approval» and sent again once (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'raised-portrait')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
