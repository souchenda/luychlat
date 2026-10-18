-- Zero public posts without the founder's approval (founder, 18/10/2026 — an unvetted quote went public at
-- 07:00 through the auto-publish fallback). Enforced here, not only in the app:
--   • a post gets a new state APPROVED when the founder taps ✅ (only from a super admin's chat);
--   • the TIMER (no chat) may publish ONLY an APPROVED post — a PENDING one at its time stays on hold and
--     expires 90 minutes later, never published;
--   • 🚀 (publish now) and ❌ (pause) work from PENDING or APPROVED, from a super admin only.
-- Where a post went is recorded (the channel's message id, the Facebook post id), so it can be edited or
-- removed later.

alter table public.scheduled_posts drop constraint if exists scheduled_posts_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_status_check
  check (status in ('PENDING', 'APPROVED', 'PUBLISHED', 'PAUSED', 'EXPIRED'));
alter table public.scheduled_posts add column if not exists telegram_message_id bigint;
alter table public.scheduled_posts add column if not exists facebook_post_id text check (facebook_post_id is null or char_length(facebook_post_id) <= 80);

create or replace function public.bot_post_take(p_key text, p_id bigint, p_status text, p_chat_id bigint default null)
returns public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  r public.scheduled_posts;
  allowed text[];
begin
  perform public.require_bot(p_key);
  if p_status not in ('APPROVED', 'PUBLISHED', 'PAUSED', 'EXPIRED') then raise exception 'bad status' using errcode = '22023'; end if;
  if p_chat_id is not null then
    actor := public.tip_chat_super_admin(p_chat_id);
    if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  end if;
  -- Which states each move may come from — the timer (no chat) can publish only what the founder approved.
  allowed := case
    when p_status = 'APPROVED' and p_chat_id is not null then array['PENDING']
    when p_status = 'PUBLISHED' and p_chat_id is not null then array['PENDING', 'APPROVED']
    when p_status = 'PUBLISHED' then array['APPROVED']
    when p_status = 'PAUSED' and p_chat_id is not null then array['PENDING', 'APPROVED']
    when p_status = 'EXPIRED' and p_chat_id is null then array['PENDING', 'APPROVED']
    else array[]::text[]
  end;
  update public.scheduled_posts
     set status = p_status,
         decided_by = coalesce(actor, decided_by),
         decided_at = case when actor is not null then now() else decided_at end
   where id = p_id and status = any(allowed)
  returning * into r;
  return r;
end;
$$;

-- Pending and approved posts whose time has come (the scheduler holds the pending ones).
create or replace function public.bot_posts_due(p_key text)
returns setof public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query select * from public.scheduled_posts where status in ('PENDING', 'APPROVED') and publish_at <= now() order by publish_at limit 10;
end;
$$;

create or replace function public.bot_post_record_ids(p_key text, p_id bigint, p_telegram bigint, p_facebook text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts
     set telegram_message_id = coalesce(p_telegram, telegram_message_id),
         facebook_post_id = coalesce(left(p_facebook, 80), facebook_post_id)
   where id = p_id;
end;
$$;
revoke all on function public.bot_post_record_ids(text, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.bot_post_record_ids(text, bigint, bigint, text) to anon, authenticated;

-- The 12:00 tip: the system never approves a tip any more (it did at 12:00 when nobody acted). Kept as a
-- harmless function so an old app version calling it changes nothing; only the founder's ✅ approves.
create or replace function public.bot_tip_auto_approve(p_key text)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return null;
end;
$$;
