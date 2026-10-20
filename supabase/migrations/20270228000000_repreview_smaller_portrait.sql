-- The portrait a little smaller (founder, 20/10/2026 — «the photo feels too big; it spoils the poster's quality»): the
-- arch 390 × 470, so the official portrait is magnified less and stays sharp; the spacing evened out. The card is
-- withdrawn from «LCA Approval» and sent again once (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'smaller-portrait')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
