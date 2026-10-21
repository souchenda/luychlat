-- Halal lesson 14/14 in the Prophet's own words (founder, 21/10/2026 — Yerny's review): the poster quotes Sahih
-- al-Bukhari 2397 and the caption carries the verified translation, instead of the generic «ខ្ចីតែពេលចាំបាច់ …».
-- Today's waiting card in «LCA Approval» (and the urgent reminder) withdrawn and sent again with it — once, by the
-- build that knows the flag (REPREVIEW_READY), until midnight (a held post can still be approved).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'lesson14-hadith')
 where kind = 'ISLAMIC_DAILY' and post_key = '2026-10-21' and status = 'PENDING';
