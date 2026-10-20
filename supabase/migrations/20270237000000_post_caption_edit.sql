-- Editing a waiting post's caption by replying to its card in «LCA Approval» (founder, 20/10/2026): an approver's reply
-- (the same check as a ✅ tap — tip_chat_super_admin) becomes the post's caption; who and when are kept beside it. The
-- card is redrawn in place, and the post goes out with that caption (its poster, channel and footer unchanged). Only a
-- post still waiting (PENDING / APPROVED); never the automatic market feeds. Null when the replied-to message is not a
-- card (the reply is then handled as usual).
create or replace function public.bot_post_edit_caption(p_key text, p_chat_id bigint, p_message_id bigint, p_actor bigint, p_text text, p_editor text)
returns public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_posts;
  actor uuid;
  clean text := nullif(btrim(coalesce(p_text, '')), '');
begin
  perform public.require_bot(p_key);
  select * into r from public.scheduled_posts
   where previews @> jsonb_build_array(jsonb_build_object('chat', p_chat_id, 'msg', p_message_id))
   order by id desc limit 1;
  if r.id is null then return null; end if;
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  if r.status not in ('PENDING', 'APPROVED') then raise exception 'not_waiting' using errcode = 'P0001'; end if;
  if r.kind in ('BULLETIN', 'RATES', 'ISLAMIC_BULLETIN', 'FUEL', 'POSTER') then raise exception 'not_editable' using errcode = 'P0001'; end if;
  if clean is null then raise exception 'empty' using errcode = '22023'; end if;
  if char_length(clean) > 900 then raise exception 'too_long' using errcode = '22023'; end if;
  update public.scheduled_posts
     set payload = payload || jsonb_build_object('caption', clean, 'caption_by', left(coalesce(p_editor, ''), 80), 'caption_at', now())
   where id = r.id
  returning * into r;
  perform public.audit('POST_CAPTION_EDIT', null, concat_ws(' · ', r.kind, r.post_key, left(coalesce(p_editor, ''), 80)), r.id::text, actor);
  return r;
end $$;
revoke all on function public.bot_post_edit_caption(text, bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.bot_post_edit_caption(text, bigint, bigint, bigint, text, text) to anon, authenticated;
