-- The waiting posts a migration flagged for a fresh preview («repreview»), any kind — the scheduler withdraws the old
-- card and sends the new one once, if its build knows the flag (REPREVIEW_READY). Only PENDING posts of the last day.
create or replace function public.bot_posts_flagged(p_key text)
returns table (kind text, post_key text, payload jsonb, publish_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
    select p.kind, p.post_key, p.payload, p.publish_at from public.scheduled_posts p
     where p.status = 'PENDING' and p.payload ? 'repreview' and p.publish_at > now() - interval '1 day';
end $$;
revoke all on function public.bot_posts_flagged(text) from public, anon, authenticated;
grant execute on function public.bot_posts_flagged(text) to anon, authenticated;

-- Tonight's bedtime du'a (founder, 20/10/2026): the reading «ប៊ីស-មី-កល់-ឡ-ហ៊ុម្ម៉ា អា-មូ-ទូ វ៉ា-អាហ៍-យ៉ា» (the kaf joins
-- the lam) — card #857 in «LCA Approval» withdrawn and sent again with it.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'sleep-dua-wasl')
 where kind = 'ISLAMIC_NIGHT' and post_key = '2026-10-20' and status = 'PENDING';
