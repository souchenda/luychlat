-- Nothing above His Majesty (founder, 20/10/2026 — «Remove the Royal Palace crest completely! We cannot place any logo
-- directly above the King's head»): the royal poster carries no crest; the borderless kbach tapestry, the portrait in the
-- golden arch, the royal text and the brand at the base only. The Coronation card is withdrawn from «LCA Approval» and
-- sent again once by the build that knows the flag (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'no-crest')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
