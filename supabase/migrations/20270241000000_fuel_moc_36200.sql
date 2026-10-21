-- MoC fuel notice t.me/mocnewsfeed/36200 — in force from 13:00 on 21 October to 1 November 2026: EA92 5,050 ៛/L,
-- diesel (Gasoil 10ppm) 5,550 ៛/L. Read from the stamped notice image (row ៩ «ថ្លៃដែលត្រូវលក់រាយ/លីត្រ (គិតជារៀល)» and the
-- price sentence above the table; the dollar row × the NBC rate agrees) and confirmed by the founder on 21/10/2026. The
-- automatic reading had not applied it: the period went unread until 8cfe0cf («ដល់»), then Gemini timed out and Groq's
-- dates disagreed. Stored as the notice's own prices (post 36200), so the MoC check sees it as applied.
-- Only when nothing newer is stored (an automatic reading that got there first is kept).
update public.app_settings
   set value = jsonb_set(
         value,
         '{fuel}',
         jsonb_build_object(
           'regular', 5050, 'super', null, 'diesel', 5550, 'lpg', null, 'lpg_unit', 'kg',
           'from', '2026-10-21', 'to', '2026-11-01', 'post', 36200, 'source', 'moc',
           'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         )
       ),
       updated_at = now()
 where key = 'market_live'
   and coalesce(value -> 'fuel' ->> 'to', '') < '2026-11-01';

insert into public.server_events (level, source, message, count)
values ('info', 'moc-fuel', 'MoC fuel prices set by migration from t.me/mocnewsfeed/36200 (founder-confirmed): EA92 5050, diesel 5550 (2026-10-21–2026-11-01)', 1);
