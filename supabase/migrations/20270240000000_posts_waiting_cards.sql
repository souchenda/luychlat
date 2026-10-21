-- The approval cards still waiting (founder, 21/10/2026 — the clean, thumb-friendly layout): after a deploy each one is
-- redrawn in place in «LCA Approval» (lib/server/scheduled-posts.ts refreshWaitingCards), so a new layout or wording
-- shows at once instead of with the next post. PENDING or APPROVED, with a card, not yet past its day.
create or replace function public.bot_posts_waiting(p_key text)
returns setof public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
    select * from public.scheduled_posts
     where status in ('PENDING', 'APPROVED')
       and jsonb_array_length(coalesce(previews, '[]'::jsonb)) > 0
       and publish_at > now() - interval '1 day'
     order by publish_at
     limit 50;
end;
$$;
revoke all on function public.bot_posts_waiting(text) from public;
grant execute on function public.bot_posts_waiting(text) to anon, authenticated;
