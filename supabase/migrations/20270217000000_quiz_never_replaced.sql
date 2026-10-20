-- Today's channel quiz (deleted from @LuyChlatIslamic on the founder's request, 20/10/2026) was offered in «LCA Approval»
-- as a «new version» with [ 🔄 ] — its content is gone, not improved. Kept as decided: a tap on that card does nothing,
-- and a retired kind is never offered for replacement again (REPLACEABLE, lib/scheduled-posts.ts).
update public.scheduled_posts set replace_status = 'KEPT'
 where kind = 'ISLAMIC_QUIZ' and replace_status in ('PENDING', 'APPROVED');
