-- Tonight's money dilemma cancelled by the founder (20/10/2026 — the poster «looks like a developer wireframe»): never
-- published to the channel or the Page. Its card #849 and the two urgent reminders were deleted from Telegram. A post
-- leaves PENDING once (bot_post_take): PAUSED is final.
update public.scheduled_posts
   set status = 'PAUSED', payload = payload - 'repreview'
 where kind = 'DILEMMA' and post_key = '2026-10-20' and status in ('PENDING', 'APPROVED');
