-- The deleted channel quiz (20/10/2026): a 🔄 tapped before 20270217 left it APPROVED / REPLACING, and the scheduler
-- retried the «replacement» every minute (never sent). Kept as decided, whatever its replace state; the scheduler
-- also ignores a non-replaceable kind (replaceDue).
update public.scheduled_posts set replace_status = 'KEPT'
 where kind = 'ISLAMIC_QUIZ' and replace_status in ('PENDING', 'APPROVED', 'REPLACING');
