-- The in-app ☀️ morning card follows the founder's decision on the morning post (founder, 13/10/2026):
-- it shows only once the post was actually published (🚀 or the timer) — never while it waits, and
-- never when it was paused («❌ ផ្អាកថ្ងៃនេះ»). The phone push goes out from the same publish step.

create or replace function public.morning_post_published(p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.scheduled_posts
    where kind = 'MORNING' and post_key = to_char(p_day, 'YYYY-MM-DD') and status = 'PUBLISHED'
  );
$$;
revoke all on function public.morning_post_published(date) from public, anon;
grant execute on function public.morning_post_published(date) to authenticated;
