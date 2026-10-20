-- The Coronation preview again, with the official ceremonial portrait the founder provided (20/10/2026 — the web photo
-- was replaced): the waiting card in «LCA Approval» is withdrawn and sent again once (bot_post_repreview_done).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'official-portrait')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
