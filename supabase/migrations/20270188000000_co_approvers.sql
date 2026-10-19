-- Co-approvers in «LCA Approval» (founder, 19/10/2026 — the founder's sister approves when he is busy).
--   • A super admin replies to the person's message in the approval group with /addapprover [email or phone]: the
--     bot records their Telegram id (from that message) and, with the login, their app account. /removeapprover
--     (same reply) takes it back. Nobody becomes an approver by writing in the group.
--   • A co-approver's [ ✅ ] [ 🚀 ] [ ❌ ] then count like a super admin's — on scheduled posts, the daily tip, qasidah
--     and place suggestions only (not /setapprovalgroup, not the bot's du'a upload).
--   • Every decision is audited «… · by <name> (Telegram <id>)» — the founder's too.
--   • Content in the app (du'a recordings, Adhans for everyone, qasidah tracks) may be managed by the «admin» staff role
--     too (granted in Admin › Staff, 2FA required), not only the super admin.

create table if not exists public.content_approvers (
  telegram_user_id bigint primary key,
  user_id          uuid references auth.users (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  active           boolean not null default true,
  added_by         uuid references auth.users (id) on delete set null,
  added_at         timestamptz not null default now()
);
alter table public.content_approvers enable row level security;
revoke all on public.content_approvers from public, anon, authenticated;
grant select on public.content_approvers to authenticated;
drop policy if exists content_approvers_read on public.content_approvers;
create policy content_approvers_read on public.content_approvers for select to authenticated using (public.is_super_admin());

/**
 * Who decides from Telegram: a super admin's linked chat, or an active co-approver (their app account, else the
 * account their Telegram is linked to). With `p_what`, the decision is audited by name — rolled back with it if the
 * decision itself fails. Null: nobody allowed.
 */
create or replace function public.tip_chat_approver(p_tg bigint, p_what text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  who text;
  co boolean := false;
begin
  uid := public.tip_chat_super_admin(p_tg);
  if uid is null then
    select coalesce(a.user_id, (select l.user_id from public.telegram_links l where l.chat_id = p_tg limit 1)), a.name
      into uid, who
      from public.content_approvers a where a.telegram_user_id = p_tg and a.active;
    co := uid is not null;
  end if;
  if uid is not null and p_what is not null then
    who := coalesce(who, (select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = uid), 'Founder');
    perform public.audit(case when co then 'CO_APPROVER_DECISION' else 'FOUNDER_DECISION' end, null,
      left(p_what || ' · by ' || who || ' (Telegram ' || p_tg || ')', 500), null, uid);
  end if;
  return uid;
end $$;
revoke all on function public.tip_chat_approver(bigint, text) from public, anon, authenticated;

-- The four decision functions ask tip_chat_approver instead (rebuilt from their live definitions; same signatures and
-- grants). Each replacement must hit exactly once, or the migration stops.
do $$
declare
  r record;
  def text;
begin
  for r in
    select * from (values
      ('public.bot_post_take(text,bigint,text,bigint)', 'public.tip_chat_super_admin(p_chat_id)',
       $x$public.tip_chat_approver(p_chat_id, 'post #' || p_id || ' → ' || p_status)$x$),
      ('public.bot_tip_action(text,bigint,date,text,integer,text,text,text)', 'public.tip_chat_super_admin(p_chat_id)',
       $x$public.tip_chat_approver(p_chat_id, 'daily tip ' || p_day || ' → ' || p_action)$x$),
      ('public.bot_nasheed_review(text,uuid,boolean,bigint,text)', 'public.tip_chat_super_admin(p_chat_id)',
       $x$public.tip_chat_approver(p_chat_id, 'qasidah ' || p_id || case when p_approve then ' → approved' else ' → rejected' end)$x$),
      ('public.bot_place_review(text,uuid,boolean,bigint)', 'public.tip_chat_super_admin(p_actor)',
       $x$public.tip_chat_approver(p_actor, 'place ' || p_id || case when p_approve then ' → approved' else ' → rejected' end)$x$)
    ) as v(fn, old_call, new_call)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if (length(def) - length(replace(def, r.old_call, ''))) / length(r.old_call) <> 1 then
      raise exception 'co-approvers: % calls % % times', r.fn, r.old_call, (length(def) - length(replace(def, r.old_call, ''))) / length(r.old_call);
    end if;
    execute replace(def, r.old_call, r.new_call);
  end loop;
end $$;

/** /addapprover (a super admin's reply in the group): the person's Telegram id and name, and their app account by login. */
create or replace function public.bot_add_approver(p_key text, p_actor bigint, p_tg bigint, p_name text, p_login text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  member uuid;
  login text := lower(btrim(coalesce(p_login, '')));
  digits text;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_tg is null or p_tg <= 0 then raise exception 'bad user' using errcode = '22023'; end if;
  if login <> '' then
    if login ~ '^[0-9+ ]+$' then
      digits := regexp_replace(login, '[^0-9]', '', 'g');
      digits := case when digits like '855%' then digits when digits like '0%' then '855' || substr(digits, 2) else '855' || digits end;
      login := digits || '@phone.luy.ibmserp.com';
    end if;
    select u.id into member from auth.users u where lower(u.email) = login;
    if member is null then return jsonb_build_object('status', 'no_account'); end if;
  end if;
  insert into public.content_approvers (telegram_user_id, user_id, name, active, added_by)
  values (p_tg, member, left(btrim(coalesce(nullif(p_name, ''), p_tg::text)), 80), true, actor)
  on conflict (telegram_user_id) do update
    set user_id = coalesce(excluded.user_id, public.content_approvers.user_id), name = excluded.name, active = true;
  perform public.audit('APPROVER_ADDED', member, left(btrim(coalesce(p_name, '')) || ' (Telegram ' || p_tg || ')', 500), null, actor);
  return jsonb_build_object('status', 'ok',
    'linked', coalesce(member, (select a.user_id from public.content_approvers a where a.telegram_user_id = p_tg),
                       (select l.user_id from public.telegram_links l where l.chat_id = p_tg limit 1)) is not null);
end $$;
revoke all on function public.bot_add_approver(text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.bot_add_approver(text, bigint, bigint, text, text) to anon, authenticated;

create or replace function public.bot_remove_approver(p_key text, p_actor bigint, p_tg bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.content_approvers set active = false where telegram_user_id = p_tg and active;
  if not found then return false; end if;
  perform public.audit('APPROVER_REMOVED', null, 'Telegram ' || p_tg, null, actor);
  return true;
end $$;
revoke all on function public.bot_remove_approver(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bot_remove_approver(text, bigint, bigint) to anon, authenticated;

-- Content in the app: the «admin» staff role too (du'a recordings, Adhans for everyone, qasidah tracks and files).
create or replace function public.dua_recording_set(p_dua text, p_path text, p_credit text, p_rights text)
returns text
language sql security definer set search_path = '' as $$
  select public.dua_recording_put(case when public.is_admin() then auth.uid() end, p_dua, p_path, p_credit, p_rights)
$$;
do $$
declare
  r record;
  def text;
begin
  for r in
    select * from (values
      ('public.dua_recording_put(uuid,text,text,text,text)', $x$a.role = 'super_admin'$x$, $x$a.role in ('super_admin', 'admin')$x$),
      ('public.dua_recording_remove(text)', 'not public.is_super_admin()', 'not public.is_admin()'),
      ('public.adhan_preset_add(text,text,text,text,text)', 'not public.is_super_admin()', 'not public.is_admin()'),
      ('public.adhan_preset_remove(uuid)', 'not public.is_super_admin()', 'not public.is_admin()')
    ) as v(fn, old_text, new_text)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in def) = 0 then raise exception 'content admins: % has no %', r.fn, r.old_text; end if;
    execute replace(def, r.old_text, r.new_text);
  end loop;
end $$;

drop policy if exists nasheed_tracks_read on public.nasheed_tracks;
create policy nasheed_tracks_read on public.nasheed_tracks for select to authenticated
  using ((active and status = 'APPROVED') or submitted_by = auth.uid() or public.is_admin());
drop policy if exists nasheed_tracks_write on public.nasheed_tracks;
create policy nasheed_tracks_write on public.nasheed_tracks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists nasheed_audio_write on storage.objects;
create policy nasheed_audio_write on storage.objects for insert to authenticated
  with check (bucket_id = 'nasheed-audio' and public.is_admin());
drop policy if exists nasheed_audio_update on storage.objects;
create policy nasheed_audio_update on storage.objects for update to authenticated
  using (bucket_id = 'nasheed-audio' and public.is_admin());
drop policy if exists nasheed_audio_delete on storage.objects;
create policy nasheed_audio_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nasheed-audio' and public.is_admin());
