-- Daily financial tip & poster for @LuyChlatCommunity, with the Super Admin's
-- approval before anything is posted.
--
--   10:30  the bot drafts today's tip (or uses one prepared in Admin › Super ›
--          Daily tips), renders the poster and sends a private preview to the
--          super admins' linked chats: [Approve] [New tip] [Skip today];
--          replying to the preview with text edits it.
--   12:00  only an APPROVED tip is posted. Nothing approved → nothing posted.
--
-- Rules enforced here, not only in the bot:
--   - only a super admin approves (in the app, or from their linked Telegram chat)
--   - approval is for one version of the text: any edit or new tip makes it a
--     DRAFT again, and a button from an older preview is refused
--   - today's tip can't be approved from 12:00 (Cambodia time) on
--   - posting needs APPROVED, today, and happens once (POSTED)
-- Every change is written to the admin audit log.

create table if not exists public.daily_tips (
  day                date primary key,
  tip_id             text,
  title              text not null check (char_length(title) between 1 and 120),
  body               text not null check (char_length(body) between 1 and 600),
  -- A custom poster (public bucket tip-posters); null → the generated one.
  poster_path        text check (poster_path is null or poster_path ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[A-Za-z0-9_-]{8,64}\.(png|jpg|jpeg|webp)$'),
  status             text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'SKIPPED', 'POSTED')),
  version            int not null default 1,
  previews           jsonb not null default '[]'::jsonb,
  approved_by        uuid references auth.users (id) on delete set null,
  approved_at        timestamptz,
  posted_at          timestamptz,
  posted_message_id  bigint,
  updated_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.daily_tips enable row level security;
revoke all on public.daily_tips from anon, authenticated;

-- Today in Cambodia, and whether today's 12:00 cut-off has passed.
create or replace function public.tip_today()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Phnom_Penh')::date $$;
create or replace function public.tip_locked(p_day date)
returns boolean language sql stable set search_path = '' as $$
  select p_day < public.tip_today()
      or (p_day = public.tip_today() and (now() at time zone 'Asia/Phnom_Penh')::time >= time '12:00')
$$;

-- The user behind a chat, when that user is a super admin (Telegram actions).
create or replace function public.tip_chat_super_admin(p_chat_id bigint)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.user_id from public.telegram_links l
  join public.app_admins a on a.user_id = l.user_id and a.role = 'super_admin'
  where l.chat_id = p_chat_id
  limit 1
$$;
revoke all on function public.tip_chat_super_admin(bigint) from public, anon, authenticated;

-- One change, shared by the app and the bot. p_action:
--   save    (title, body, tip_id, poster_path) → DRAFT, version + 1
--   approve (p_version must be current)        → APPROVED
--   skip                                       → SKIPPED
--   draft                                      → DRAFT (undo approve / skip)
create or replace function public.tip_apply(p_actor uuid, p_day date, p_action text, p_version int default null,
                                            p_title text default null, p_body text default null, p_tip_id text default null,
                                            p_poster_path text default null, p_keep_poster boolean default true)
returns public.daily_tips
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.daily_tips;
begin
  if p_day is null or p_day < public.tip_today() then raise exception 'past_day' using errcode = '22023'; end if;
  select * into t from public.daily_tips where day = p_day for update;
  if t.status = 'POSTED' then raise exception 'already_posted' using errcode = 'P0001'; end if;

  if p_action = 'save' then
    if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then raise exception 'empty_tip' using errcode = '22023'; end if;
    insert into public.daily_tips as d (day, tip_id, title, body, poster_path, status, version, updated_by, updated_at)
    values (p_day, p_tip_id, btrim(p_title), btrim(p_body), p_poster_path, 'DRAFT', 1, p_actor, now())
    on conflict (day) do update
      set tip_id = excluded.tip_id, title = excluded.title, body = excluded.body,
          poster_path = case when p_keep_poster and excluded.poster_path is null then d.poster_path else excluded.poster_path end,
          status = 'DRAFT', version = d.version + 1, approved_by = null, approved_at = null,
          updated_by = p_actor, updated_at = now()
    returning * into t;
  elsif t.day is null then
    raise exception 'no_tip' using errcode = 'P0001';
  elsif p_action = 'approve' then
    if public.tip_locked(p_day) then raise exception 'too_late' using errcode = 'P0001'; end if;
    if p_version is not null and p_version <> t.version then raise exception 'stale_version' using errcode = 'P0001'; end if;
    update public.daily_tips set status = 'APPROVED', approved_by = p_actor, approved_at = now(), updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'skip' then
    update public.daily_tips set status = 'SKIPPED', approved_by = null, approved_at = null, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'draft' then
    update public.daily_tips set status = 'DRAFT', approved_by = null, approved_at = null, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  perform public.audit('DAILY_TIP_' || upper(p_action), null,
    to_char(p_day, 'YYYY-MM-DD') || ' v' || t.version || ' · ' || left(t.title, 80), null, p_actor);
  return t;
end;
$$;
revoke all on function public.tip_apply(uuid, date, text, int, text, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- app (super admins)

create or replace function public.super_tips_list(p_from date default null, p_days int default 7)
returns setof public.daily_tips
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_super_admin();
  return query select * from public.daily_tips
    where day >= coalesce(p_from, public.tip_today()) and day < coalesce(p_from, public.tip_today()) + least(greatest(p_days, 1), 31)
    order by day;
end;
$$;

create or replace function public.super_tip_change(p_day date, p_action text, p_version int default null,
                                                   p_title text default null, p_body text default null, p_tip_id text default null,
                                                   p_poster_path text default null, p_keep_poster boolean default true)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_super_admin();
  return public.tip_apply(auth.uid(), p_day, p_action, p_version, p_title, p_body, p_tip_id, p_poster_path, p_keep_poster);
end;
$$;

revoke all on function public.super_tips_list(date, int) from public, anon;
revoke all on function public.super_tip_change(date, text, int, text, text, text, text, boolean) from public, anon;
grant execute on function public.super_tips_list(date, int) to authenticated;
grant execute on function public.super_tip_change(date, text, int, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- bot

create or replace function public.bot_super_admin_chats(p_key text)
returns table (chat_id bigint, user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query select l.chat_id, l.user_id from public.telegram_links l
    join public.app_admins a on a.user_id = l.user_id and a.role = 'super_admin'
    where l.chat_id is not null;
end;
$$;

create or replace function public.bot_tip_get(p_key text, p_day date)
returns public.daily_tips
language plpgsql stable security definer set search_path = '' as $$
declare t public.daily_tips;
begin
  perform public.require_bot(p_key);
  select * into t from public.daily_tips where day = p_day;
  return t;
end;
$$;

-- The 10:30 draft when none was prepared (the system writes it; no approval implied).
create or replace function public.bot_tip_ensure(p_key text, p_day date, p_tip_id text, p_title text, p_body text)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
declare t public.daily_tips;
begin
  perform public.require_bot(p_key);
  insert into public.daily_tips (day, tip_id, title, body) values (p_day, p_tip_id, p_title, p_body)
  on conflict (day) do nothing;
  select * into t from public.daily_tips where day = p_day;
  return t;
end;
$$;

-- A button or reply-edit from Telegram: only from a super admin's linked chat.
create or replace function public.bot_tip_action(p_key text, p_chat_id bigint, p_day date, p_action text, p_version int default null,
                                                 p_title text default null, p_body text default null, p_tip_id text default null)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  t public.daily_tips;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_super_admin(p_chat_id);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_action = 'save' then
    select * into t from public.daily_tips where day = p_day;
    -- An edit or a new tip from Telegram drops a custom poster only for a new tip.
    return public.tip_apply(actor, p_day, 'save', null, p_title, p_body, coalesce(p_tip_id, t.tip_id), null, p_tip_id is null);
  end if;
  return public.tip_apply(actor, p_day, p_action, p_version);
end;
$$;

create or replace function public.bot_tip_set_previews(p_key text, p_day date, p_previews jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  if jsonb_typeof(p_previews) <> 'array' then raise exception 'invalid' using errcode = '22023'; end if;
  update public.daily_tips set previews = p_previews where day = p_day;
end;
$$;

-- The day whose preview this message is (reply-to-edit).
create or replace function public.bot_tip_by_preview(p_key text, p_chat_id bigint, p_message_id bigint)
returns date
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return (select day from public.daily_tips
          where previews @> jsonb_build_array(jsonb_build_object('chat', p_chat_id, 'msg', p_message_id))
          order by day desc limit 1);
end;
$$;

-- 12:00: claims today's APPROVED tip for posting (once); null when there is none.
create or replace function public.bot_tip_claim_post(p_key text)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
declare t public.daily_tips;
begin
  perform public.require_bot(p_key);
  update public.daily_tips set status = 'POSTED', posted_at = now()
   where day = public.tip_today() and status = 'APPROVED' and approved_by is not null
  returning * into t;
  if t.day is not null then
    perform public.audit('DAILY_TIP_POSTED', null, to_char(t.day, 'YYYY-MM-DD') || ' v' || t.version || ' · ' || left(t.title, 80), null, t.approved_by);
  end if;
  return t;
end;
$$;

create or replace function public.bot_tip_posted(p_key text, p_day date, p_message_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.daily_tips set posted_message_id = p_message_id where day = p_day and status = 'POSTED';
end;
$$;

-- Sending to the channel failed: back to APPROVED so the next minute retries (12:00–12:59 only).
create or replace function public.bot_tip_post_failed(p_key text, p_day date)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.daily_tips set status = 'APPROVED', posted_at = null
   where day = p_day and status = 'POSTED' and posted_message_id is null;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_tip_post_failed(text, date)',
    'public.bot_super_admin_chats(text)',
    'public.bot_tip_get(text, date)',
    'public.bot_tip_ensure(text, date, text, text, text)',
    'public.bot_tip_action(text, bigint, date, text, int, text, text, text)',
    'public.bot_tip_set_previews(text, date, jsonb)',
    'public.bot_tip_by_preview(text, bigint, bigint)',
    'public.bot_tip_claim_post(text)',
    'public.bot_tip_posted(text, date, bigint)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- Custom posters: public (they are published once approved), only super admins upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tip-posters', 'tip-posters', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tip_posters_super_insert on storage.objects;
create policy tip_posters_super_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'tip-posters' and public.is_super_admin());
drop policy if exists tip_posters_super_delete on storage.objects;
create policy tip_posters_super_delete on storage.objects
  for delete to authenticated using (bucket_id = 'tip-posters' and public.is_super_admin());

select public.apply_security_gate();
