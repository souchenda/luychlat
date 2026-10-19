-- The content approval room and the factual feeds (founder, 19/10/2026).
--
-- 1. «LCA Approval»: a private Telegram group where every content preview goes, with its
--    [ ✅ ] [ 🚀 ] [ ❌ ] buttons, instead of the founder's busy private chat (slips, sales, …). A super admin
--    sets it from inside the group with /setapprovalgroup (bot_set_approval_chat checks the person, not the
--    chat). The bot never leaves it (lib/server/group-guard.ts), and a tap in it is still checked: only a
--    super admin's tap approves (bot_post_take, unchanged).
--
-- 2. Factual feeds publish on time without a tap: the market bulletin (NBC rates, gold, fuel), the evening NBC
--    rates and the 05:30 prayer times with the waking du'a. They are created APPROVED — by policy, recorded in
--    their payload — so the timer publishes them at their time; the founder still gets the preview and can
--    [ ❌ ] pause or [ 🚀 ] publish now. Everything else (Facebook, humour, stories, dilemmas, posters, video)
--    stays PENDING until the founder's tap: the database decides, not the app (AUTO_PUBLISH_KINDS in
--    lib/scheduled-posts.ts mirrors this list; scheduled-posts.test.ts compares them).

alter table public.bot_config add column if not exists approval_chat_id bigint;

/** The approval group's chat id (null = not set: previews go to the marketing chat or the super admins). */
create or replace function public.bot_approval_chat(p_key text)
returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return (select approval_chat_id from public.bot_config where id = 1);
end;
$$;

/**
 * /setapprovalgroup from inside a group: `p_actor` is the Telegram user who sent it — a super admin only.
 * The group stops being tracked by the 10-minute «no pool linked» watchdog. Audited.
 */
create or replace function public.bot_set_approval_chat(p_key text, p_chat_id bigint, p_actor bigint)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
begin
  perform public.require_bot(p_key);
  if p_chat_id is null or p_chat_id >= 0 then raise exception 'a group chat id is negative' using errcode = '22023'; end if;
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.bot_config set approval_chat_id = p_chat_id, updated_at = now() where id = 1;
  delete from public.telegram_groups where chat_id = p_chat_id;
  perform public.audit('APPROVAL_GROUP_SET', actor, null, p_chat_id::text, actor);
  return p_chat_id;
end;
$$;

revoke all on function public.bot_approval_chat(text) from public, anon, authenticated;
revoke all on function public.bot_set_approval_chat(text, bigint, bigint) from public, anon, authenticated;

/** The kinds the timer may publish without a tap — factual feeds only. */
create or replace function public.post_auto_publish(p_kind text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('BULLETIN', 'RATES', 'ISLAMIC_MORNING')
$$;

create or replace function public.bot_post_schedule(p_key text, p_kind text, p_post_key text, p_payload jsonb, p_publish_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_posts;
  auto boolean := public.post_auto_publish(p_kind);
begin
  perform public.require_bot(p_key);
  delete from public.scheduled_posts where created_at < now() - interval '60 days';
  insert into public.scheduled_posts (kind, post_key, payload, publish_at, status)
  values (
    p_kind, p_post_key,
    coalesce(p_payload, '{}'::jsonb) || case when auto then jsonb_build_object('auto_approved', 'factual feed') else '{}'::jsonb end,
    p_publish_at,
    case when auto then 'APPROVED' else 'PENDING' end
  )
  on conflict (kind, post_key) do nothing
  returning * into r;
  if r.id is not null then
    return to_jsonb(r) || jsonb_build_object('created', true);
  end if;
  select * into r from public.scheduled_posts where kind = p_kind and post_key = p_post_key;
  return to_jsonb(r) || jsonb_build_object('created', false);
end;
$$;
