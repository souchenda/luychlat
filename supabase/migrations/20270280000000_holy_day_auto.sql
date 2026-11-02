-- The Sil day post publishes on its own at 07:00 (founder, 2/11/2026: «we already decided every Sil day — it only has to go
-- out when the day comes»). The branded poster and the eve note are fixed by the calendar, so no card waits in «LCA Approval»
-- (lib/scheduled-posts.ts AUTO_PUBLISH_KINDS — the same list). Telegram channel only; the Page is no longer fed.

create or replace function public.post_auto_publish(p_kind text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('BULLETIN', 'RATES', 'ISLAMIC_MORNING', 'ISLAMIC_BULLETIN', 'ISLAMIC_NIGHT', 'HOLYDAY')
$$;
