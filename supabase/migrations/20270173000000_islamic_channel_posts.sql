-- The Islamic community channel (@LuyChlatIslamic, founder, 18/10/2026): its own posts — the Hijri date with a
-- halal-finance lesson, the Monday / Thursday sunnah fast reminder and Jumu'ah — go through the same
-- preview-first approval as the general channel (bot_post_take: the timer publishes only an APPROVED post).
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY',
                  'ISLAMIC_DAILY', 'ISLAMIC_FAST', 'ISLAMIC_JUMUAH'));

-- The admin's Islamic defaults (the Hijri offset), so the channel shows the same Hijri day as the app.
create or replace function public.bot_islamic_defaults(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return (select s.value from public.app_settings s where s.key = 'islamic_defaults');
end;
$$;
revoke all on function public.bot_islamic_defaults(text) from public;
grant execute on function public.bot_islamic_defaults(text) to anon, authenticated;
