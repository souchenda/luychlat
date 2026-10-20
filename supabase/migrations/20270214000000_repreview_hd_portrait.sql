-- The Coronation preview again with the HD portrait (founder, 20/10/2026 — «quality must be immaculate»): the official
-- portrait upscaled 4× (Lanczos) and sharpened; the waiting card is withdrawn and sent again once.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'hd-portrait')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
