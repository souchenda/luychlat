-- A waiting preview sent again (founder, 20/10/2026 — «It is STILL ONLY TEXT!»): a post flagged «repreview» has its old
-- preview messages deleted from «LCA Approval» by the scheduler and a fresh preview sent (now with the King's portrait
-- and the Royal Coat of Arms). The flag is cleared once done, so it happens once. Only while nobody has decided.
create or replace function public.bot_post_repreview_done(p_key text, p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts set payload = payload - 'repreview', previews = '[]'::jsonb where id = p_id and status = 'PENDING';
end $$;
revoke all on function public.bot_post_repreview_done(text, bigint) from public, anon, authenticated;
grant execute on function public.bot_post_repreview_done(text, bigint) to anon, authenticated;

-- The 29 October Coronation, previewed as text at 11:45: again with the portrait.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'portrait')
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
