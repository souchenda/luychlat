-- The Coronation card without the drawn silhouettes (founder, 20/10/2026 — «the flat programmatic vector silhouettes …
-- look like crude clipart and are completely unworthy of His Majesty the King»): withdrawn from «LCA Approval» and sent
-- again once by the build that knows the flag (REPREVIEW_READY). The founder's photographic backdrop
-- (bg_royal_coronation.jpg) is used full bleed as soon as it is on the server.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'no-clipart')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
