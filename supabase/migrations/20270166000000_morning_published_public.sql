-- https://app.luychlat.com/posters/today.png (founder, 15/10/2026): the public link to today's morning
-- poster asks whether it was published — only then is it shown (never while it waits for the 06:15
-- preview's decision, never after «❌ ផ្អាកថ្ងៃនេះ»). The answer is about a public post, so anyone may ask.
grant execute on function public.morning_post_published(date) to anon;
