-- No quiz in @LuyChlatIslamic (founder, 20/10/2026 — «just plain text without any choices… It should not be in the
-- Telegram channel at all»): the scheduler no longer plans the 12:30 teaser; any one still waiting never goes out.
-- The Islamic Quiz Challenge stays in the app (/islamic?tab=quiz). Today's message was deleted from the channel.
update public.scheduled_posts set status = 'EXPIRED'
 where kind = 'ISLAMIC_QUIZ' and status in ('PENDING', 'APPROVED');
