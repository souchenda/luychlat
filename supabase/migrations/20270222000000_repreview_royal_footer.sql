-- Royal protocol (founder, 20/10/2026 — the CBC model): nothing commercial above His Majesty. The brand leaves the top of
-- the royal poster for the footer; the upper area holds only the portrait and the Royal Coat of Arms. The Coronation
-- card is withdrawn from «LCA Approval» and sent again once by the build that knows the flag (REPREVIEW_READY).
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'royal-footer')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
