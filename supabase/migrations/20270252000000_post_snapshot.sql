-- What a published post was (founder, 22/10/2026 — Task #462): its caption and its poster's fingerprint, kept when it goes
-- out, so a 🔄 card can say what changed («✍️ ចំណុចកែប្រែ ៖ …») instead of the approver comparing word by word.
alter table public.scheduled_posts add column if not exists published_body text;
alter table public.scheduled_posts add column if not exists published_poster text;

drop function if exists public.bot_post_set_hash(text, bigint, text);
create or replace function public.bot_post_set_hash(p_key text, p_id bigint, p_hash text, p_body text default null, p_poster text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts
     set content_hash = left(p_hash, 128),
         published_body = coalesce(left(p_body, 8000), published_body),
         published_poster = coalesce(left(p_poster, 64), published_poster)
   where id = p_id and status = 'PUBLISHED';
end $$;
revoke all on function public.bot_post_set_hash(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_post_set_hash(text, bigint, text, text, text) to anon, authenticated;

-- The footer's links are joined by « · » now (they were « || », shown «| |» on phones): every post's text changes with it.
-- Today's published posts are not offered for replacement for that alone — their version check is skipped today.
update public.scheduled_posts
   set content_hash = null
 where status = 'PUBLISHED'
   and (publish_at at time zone 'Asia/Phnom_Penh')::date = (now() at time zone 'Asia/Phnom_Penh')::date;
