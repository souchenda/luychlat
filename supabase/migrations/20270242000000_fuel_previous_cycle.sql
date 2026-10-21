-- The cycle before MoC notice #36200 (founder, 21/10/2026 — «prepare the fuel price change announcement»): notice #36200
-- was stored by migration 20270241 without the cycle before, so its announcement had nothing to compare with. The prices
-- it replaced were notice #35950 (11–21 October 2026: EA92 5,350 ៛/L, diesel 5,550 ៛/L — the stored values until
-- 13:25 today). With them kept as `fuel.previous`, the app schedules the «⛽ តម្លៃប្រេងថ្មី» card (EA92 ▼ 300) for
-- approval in «LCA Approval» (lib/server/moc-fuel-sync › announceAppliedFuel). Only while #36200 is the stored notice.
update public.app_settings
   set value = jsonb_set(
         value,
         '{fuel,previous}',
         jsonb_build_object('regular', 5350, 'super', null, 'diesel', 5550, 'from', '2026-10-11', 'to', '2026-10-21', 'post', 35950)
       ),
       updated_at = now()
 where key = 'market_live'
   and (value -> 'fuel' ->> 'post')::bigint = 36200
   and value -> 'fuel' -> 'previous' is null;
