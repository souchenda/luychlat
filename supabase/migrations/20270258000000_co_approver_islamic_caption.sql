-- The Islamic advisor edits Islamic posts (founder, 25/10/2026 — Task #502: Nuryerny Ahmad (@yernysou), a co-approver
-- since 19/10, was refused with «សម្រាប់អ្នកអនុម័តប៉ុណ្ណោះ។» when she corrected today's lesson — ✅ 🚀 ❌ and 🔄 already
-- accepted her, ✏️ (the caption edit) was the super admin's only). Now a co-approver of «LCA Approval» may edit the caption
-- of an Islamic post (ISLAMIC_*), audited by name; the general channel's posts stay the super admin's. An Islamic caption
-- may run to 1,000 characters (a lesson with its story is longer than the 900 of the other posts; a photo takes 1,024).
create or replace function public.bot_post_edit_caption(p_key text, p_chat_id bigint, p_message_id bigint, p_actor bigint, p_text text, p_editor text)
returns public.scheduled_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.scheduled_posts;
  actor uuid;
  clean text := nullif(btrim(coalesce(p_text, '')), '');
  islamic boolean;
begin
  perform public.require_bot(p_key);
  select * into r from public.scheduled_posts
   where previews @> jsonb_build_array(jsonb_build_object('chat', p_chat_id, 'msg', p_message_id))
   order by id desc limit 1;
  if r.id is null then return null; end if;
  islamic := r.kind like 'ISLAMIC%';
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null and islamic then actor := public.tip_chat_approver(p_actor, 'post #' || r.id || ' caption edited'); end if;
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  if r.status not in ('PENDING', 'APPROVED') then raise exception 'not_waiting' using errcode = 'P0001'; end if;
  if r.kind in ('BULLETIN', 'RATES', 'ISLAMIC_BULLETIN', 'FUEL', 'POSTER') then raise exception 'not_editable' using errcode = 'P0001'; end if;
  if clean is null then raise exception 'empty' using errcode = '22023'; end if;
  if char_length(clean) > (case when islamic then 1000 else 900 end) then raise exception 'too_long' using errcode = '22023'; end if;
  update public.scheduled_posts
     set payload = payload || jsonb_build_object('caption', clean, 'caption_by', left(coalesce(p_editor, ''), 80), 'caption_at', now())
   where id = r.id
  returning * into r;
  perform public.audit('POST_CAPTION_EDIT', null, concat_ws(' · ', r.kind, r.post_key, left(coalesce(p_editor, ''), 80)), r.id::text, actor);
  return r;
end $$;

select public.apply_security_gate();
