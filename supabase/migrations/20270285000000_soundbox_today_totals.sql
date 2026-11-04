-- The SoundBox's daily closing summary (founder, 4/11/2026 — src/lib/soundbox.ts closingClipSequence): today's KHQR sales
-- counted by the database, exact — the page's own list stops at 200 rows. Today = the Cambodian day. Security invoker: the
-- soundbox_events RLS (workspace members only) decides what is counted, the same rows the cashier's screen receives.
-- Additive only.
create or replace function public.soundbox_today_totals()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'khr', coalesce(sum(e.amount) filter (where e.currency = 'KHR'), 0),
    'usd', coalesce(sum(e.amount) filter (where e.currency = 'USD'), 0),
    'count', count(*)
  )
  from public.soundbox_events e
  where e.transaction_time >= (date_trunc('day', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh');
$$;

revoke all on function public.soundbox_today_totals() from public, anon;
grant execute on function public.soundbox_today_totals() to authenticated;
