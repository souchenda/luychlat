-- The Coronation card again, now from the HD build (founder, 20/10/2026 — «quality must be immaculate»): the HD flag
-- (20270214) was consumed by the previous build, which re-sent the official portrait at its old size (message 806).
-- The build live now (with the HD portrait) withdraws 806 and sends the HD card, once.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'hd-portrait-live')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
