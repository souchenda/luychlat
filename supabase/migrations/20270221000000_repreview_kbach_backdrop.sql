-- The Coronation card with the founder's traditional Khmer kbach backdrop (20/10/2026): deep emerald, the lotus
-- watermark and the four golden corners, full bleed; the brand at the top centre and the crest inside the top-right
-- corner. Withdrawn from «LCA Approval» and sent again once by the build that knows the flag (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'kbach-backdrop')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
