-- Daily tip safety (founder, 14/10/2026 — a one-line comment sent to «✏️ កែអត្ថបទ» became the tip's
-- body and auto-published at 12:00):
--   pending_edit    a reply to «✏️ កែអត្ថបទ» is only a PROPOSAL: shown as a formatted preview with
--                   [✅ ប្រើអត្ថបទនេះ] [❌ បោះបង់]; nothing changes before ✅.
--   posted_version  the version the channel post shows; a corrected tip (a higher version) is edited into
--                   the published post in place by the bot.

alter table public.daily_tips
  add column if not exists pending_edit jsonb,
  add column if not exists posted_version int;
update public.daily_tips set posted_version = version where status = 'POSTED' and posted_version is null;

create or replace function public.bot_tip_posted(p_key text, p_day date, p_message_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.daily_tips set posted_message_id = p_message_id, posted_version = version where day = p_day and status = 'POSTED';
end;
$$;

-- The proposal from a reply (or null to drop it), kept until ✅ / ❌.
create or replace function public.bot_tip_set_pending(p_key text, p_day date, p_pending jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.daily_tips set pending_edit = p_pending where day = p_day;
end;
$$;

-- The channel post now shows this version.
create or replace function public.bot_tip_republished(p_key text, p_day date, p_version int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.daily_tips set posted_version = p_version where day = p_day and status = 'POSTED';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_tip_posted(text, date, bigint)',
    'public.bot_tip_set_pending(text, date, jsonb)',
    'public.bot_tip_republished(text, date, int)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- A tip held for the founder (edited or flagged — never auto-approved) can still be approved until 13:00,
-- while the 12:00–12:59 post step runs; everything else is as before.
create or replace function public.tip_apply(p_actor uuid, p_day date, p_action text, p_version integer default null, p_title text default null, p_body text default null, p_tip_id text default null, p_poster_path text default null, p_keep_poster boolean default true)
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
          status = 'DRAFT', version = d.version + 1, approved_by = null, approved_at = null, auto_approved = false,
          updated_by = p_actor, updated_at = now()
    returning * into t;
  elsif t.day is null then
    raise exception 'no_tip' using errcode = 'P0001';
  elsif p_action = 'approve' then
    if public.tip_locked(p_day) and (p_day < public.tip_today() or (now() at time zone 'Asia/Phnom_Penh')::time >= time '13:00') then
      raise exception 'too_late' using errcode = 'P0001';
    end if;
    if p_version is not null and p_version <> t.version then raise exception 'stale_version' using errcode = 'P0001'; end if;
    update public.daily_tips set status = 'APPROVED', approved_by = p_actor, approved_at = now(), auto_approved = false, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'skip' then
    update public.daily_tips set status = 'SKIPPED', approved_by = null, approved_at = null, auto_approved = false, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'draft' then
    update public.daily_tips set status = 'DRAFT', approved_by = null, approved_at = null, auto_approved = false, updated_by = p_actor, updated_at = now()
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
