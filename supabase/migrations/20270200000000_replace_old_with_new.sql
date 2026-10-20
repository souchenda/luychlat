-- REPLACE OLD WITH NEW (founder, 20/10/2026): a post already published today whose content has since been improved
-- (a new poster, a corrected caption) is replaced — the new version is published, then the old message is deleted from
-- the channel (and the Page). Never without an approver: the new version is previewed in «LCA Approval» with
-- [ 🔄 ជំនួសដោយកំណែថ្មី ] [ ❌ រក្សាកំណែចាស់ ]; only a tap (super admin or co-approver, audited) lets it out.
--   content_hash      what was published (the poster and the caption), recorded at publish time
--   replace_status    null · PENDING (asked) · APPROVED (to do) · REPLACING (claimed) · DONE · KEPT
--   replaced_ids      the old messages removed: [{telegram, facebook, at}]

alter table public.scheduled_posts
  add column if not exists content_hash text,
  add column if not exists replace_status text check (replace_status in ('PENDING', 'APPROVED', 'REPLACING', 'DONE', 'KEPT')),
  add column if not exists replaced_ids jsonb not null default '[]'::jsonb;

-- What was published, recorded right after the publish.
create or replace function public.bot_post_set_hash(p_key text, p_id bigint, p_hash text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts set content_hash = left(p_hash, 128) where id = p_id and status = 'PUBLISHED';
end $$;
revoke all on function public.bot_post_set_hash(text, bigint, text) from public, anon, authenticated;
grant execute on function public.bot_post_set_hash(text, bigint, text) to anon, authenticated;

-- Today's published posts (Cambodia date), for the version check and the replacements.
create or replace function public.bot_posts_published_today(p_key text)
returns setof public.scheduled_posts
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  select * from public.scheduled_posts p
   where p.status = 'PUBLISHED' and p.telegram_message_id is not null
     and (p.publish_at at time zone 'Asia/Phnom_Penh')::date = (now() at time zone 'Asia/Phnom_Penh')::date
   order by p.publish_at;
end $$;
revoke all on function public.bot_posts_published_today(text) from public, anon, authenticated;
grant execute on function public.bot_posts_published_today(text) to anon, authenticated;

-- A newer version was found: ask once (PENDING) — not again for a post being replaced or already asked.
create or replace function public.bot_post_replace_ask(p_key text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts set replace_status = 'PENDING'
   where id = p_id and status = 'PUBLISHED' and coalesce(replace_status, 'DONE') in ('DONE', 'KEPT');
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.bot_post_replace_ask(text, bigint) from public, anon, authenticated;
grant execute on function public.bot_post_replace_ask(text, bigint) to anon, authenticated;

-- [ 🔄 ] / [ ❌ ] from an approver (tip_chat_approver: super admin or co-approver, audited with name and Telegram id).
create or replace function public.bot_post_replace_decide(p_key text, p_id bigint, p_replace boolean, p_chat_id bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  n int;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_approver(p_chat_id, 'post #' || p_id || case when p_replace then ' → REPLACE' else ' → KEEP' end);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.scheduled_posts
     set replace_status = case when p_replace then 'APPROVED' else 'KEPT' end
   where id = p_id and status = 'PUBLISHED' and replace_status = 'PENDING';
  get diagnostics n = row_count;
  return case when n = 1 then (case when p_replace then 'APPROVED' else 'KEPT' end) else 'done' end;
end $$;
revoke all on function public.bot_post_replace_decide(text, bigint, boolean, bigint) from public, anon, authenticated;
grant execute on function public.bot_post_replace_decide(text, bigint, boolean, bigint) to anon, authenticated;

-- The approved replacements, each claimed once (APPROVED → REPLACING) so two passes never post it twice.
create or replace function public.bot_post_replace_take(p_key text)
returns setof public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  update public.scheduled_posts p set replace_status = 'REPLACING'
   where p.id in (select q.id from public.scheduled_posts q where q.status = 'PUBLISHED' and q.replace_status = 'APPROVED'
                   order by q.publish_at limit 3 for update skip locked)
  returning p.*;
end $$;
revoke all on function public.bot_post_replace_take(text) from public, anon, authenticated;
grant execute on function public.bot_post_replace_take(text) to anon, authenticated;

-- Replaced: the new ids and what was published; the old ones kept in replaced_ids. Not replaced (the new version could
-- not be sent): back to APPROVED for the next pass — the old post stays up meanwhile.
create or replace function public.bot_post_replace_done(p_key text, p_id bigint, p_ok boolean, p_telegram bigint, p_facebook text, p_hash text, p_old_removed boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  if not p_ok then
    update public.scheduled_posts set replace_status = 'APPROVED' where id = p_id and replace_status = 'REPLACING';
    return;
  end if;
  update public.scheduled_posts
     set replaced_ids = replaced_ids || jsonb_build_array(jsonb_build_object('telegram', telegram_message_id, 'facebook', facebook_post_id,
                                                                             'removed', p_old_removed, 'at', now())),
         telegram_message_id = coalesce(p_telegram, telegram_message_id),
         facebook_post_id = coalesce(p_facebook, facebook_post_id),
         content_hash = left(p_hash, 128),
         replace_status = 'DONE'
   where id = p_id and replace_status = 'REPLACING';
end $$;
revoke all on function public.bot_post_replace_done(text, bigint, boolean, bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bot_post_replace_done(text, bigint, boolean, bigint, text, text, boolean) to anon, authenticated;

-- Today's lesson 13 «ដៃខាងលើ ប្រសើរជាងដៃខាងក្រោម» (published 08:38 with the poster that repeated its title): replaced on
-- the founder's own instruction (20/10/2026 — «delete the old post and publish the new lesson 13 poster»), audited.
do $$
declare
  r public.scheduled_posts;
  founder uuid;
begin
  select * into r from public.scheduled_posts
   where kind = 'ISLAMIC_DAILY' and post_key = '2026-10-20' and status = 'PUBLISHED' and replace_status is null;
  if not found then return; end if;
  select a.user_id into founder from public.app_admins a where a.role = 'super_admin' order by a.user_id limit 1;
  update public.scheduled_posts set replace_status = 'APPROVED' where id = r.id;
  perform public.audit('POST_REPLACE', null, 'post #' || r.id || ' → REPLACE · lesson 13 with the new poster, on the founder''s instruction (20/10/2026)', r.id::text, founder);
end $$;
