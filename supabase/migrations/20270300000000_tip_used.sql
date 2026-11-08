-- Every tip already shown to readers (founder, 8/11/2026: «គន្លឹះត្រូវតែថ្មីជានិច្ច» — the 12:00 tip came back after ~4 weeks,
-- the bot only avoided yesterday's). The bot picks a tip none of these used (lib/daily-tip.ts freshTip). Read-only, additive.
create or replace function public.bot_tip_used(p_key text, p_day date)
returns table(tip_id text, title text, day date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select t.tip_id, t.title, t.day from public.daily_tips t
    where t.day < p_day and t.status = 'POSTED'
    order by t.day;
end;
$$;
revoke all on function public.bot_tip_used(text, date) from public, anon, authenticated;
grant execute on function public.bot_tip_used(text, date) to anon, authenticated;
