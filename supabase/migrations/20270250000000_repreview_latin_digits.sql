-- International numerals (founder, 21/10/2026 — Task #440): channel posts, posters and the bot speak 0-9. The waiting
-- cards' captions are redrawn in place after the deploy (refreshWaitingCards), but a poster card's image was drawn with
-- Khmer digits — so every card still waiting (today or later, with a preview sent) is withdrawn and sent again with the
-- 0-9 poster (REPREVIEW_READY «latin-digits»). The royal and national commemorations keep their Khmer numerals and are
-- not touched; the money dilemma is re-previewed by its own daily path.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'latin-digits')
 where status = 'PENDING'
   and kind not in ('NATIONAL_DAY', 'DILEMMA')
   and publish_at > now() - interval '1 day'
   and jsonb_array_length(coalesce(previews, '[]'::jsonb)) > 0;
