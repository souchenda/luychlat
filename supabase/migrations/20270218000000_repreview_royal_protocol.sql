-- The Coronation card once more (founder, 20/10/2026 royal-protocol audit): the sub-decree title «…គ្រងព្រះបរមរាជសម្បត្តិ»,
-- the King's title spacing, the dateline «… – … · ខួបលើកទី២២», the official palace blessing, and the national backdrop
-- (the Independence Monument, the Throne Hall, the flag ribbon). Only the build that knows the flag acts on it
-- (REPREVIEW_READY): the previous card is withdrawn from «LCA Approval» and the new one sent, once.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'royal-protocol')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
