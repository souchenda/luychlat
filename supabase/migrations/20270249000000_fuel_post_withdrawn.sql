-- The #36200 fuel post published by mistake (founder, 21/10/2026, 19:08 — 🚀 tapped on a card made before Task #432): the
-- channel message (80) and the Page post (1412894668565532_122113004517500901) were deleted at 19:2x by the founder's
-- instruction (Telegram deleteMessage ok, Graph API DELETE success). Recorded on the post, and the post re-armed: back to
-- PENDING with no preview, flagged «fuel-withdrawn» so the new build sends a fresh card (EA92 5,050 ៛ ▼ 300, diesel
-- 5,550 ៛, «តម្លៃប្រេងសាំង», app.luychlat.com) to «LCA Approval» — published again only on a new ✅ / 🚀.
update public.scheduled_posts
   set status = 'PENDING',
       previews = '[]'::jsonb,
       telegram_message_id = null,
       facebook_post_id = null,
       content_hash = null,
       decided_by = null,
       decided_at = null,
       decided_name = null,
       decided_username = null,
       decided_how = null,
       payload = payload
         || jsonb_build_object('repreview', 'fuel-withdrawn')
         || jsonb_build_object('withdrawn', jsonb_build_object(
              'at', now(), 'telegram_message_id', 80, 'facebook_post_id', '1412894668565532_122113004517500901',
              'reason', 'published by mistake before Task #432 — deleted on the founder''s instruction'))
 where kind = 'FUEL' and post_key = 'notice-36200' and status = 'PUBLISHED' and telegram_message_id = 80;

insert into public.server_events (level, source, message, count)
values ('info', 'scheduled-posts', 'FUEL notice-36200: the mistaken post withdrawn (channel message 80 and the Page post deleted) and re-armed for a fresh approval card', 1);
