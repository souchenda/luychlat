-- The community qasidah library (founder, 20/10/2026): at most 30 public tracks; plays counted; the least-played member
-- track older than 7 days makes room for a new one — moved (never deleted) into its submitter's «បទផ្ទាល់ខ្លួន» with
-- an Islamic note to them and a line to the founder. The app's own curated recordings are never moved (no submitter).

alter table public.nasheed_tracks
  add column if not exists play_count int not null default 0 check (play_count >= 0),
  add column if not exists demoted_at timestamptz;

-- ─── Plays: a listen past 15 seconds (the app's player), at most once per listener and track every 30 minutes ─────
create table if not exists public.nasheed_plays (
  track_id uuid not null references public.nasheed_tracks (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  last_at  timestamptz not null default now(),
  primary key (track_id, user_id)
);
alter table public.nasheed_plays enable row level security;
revoke all on public.nasheed_plays from public, anon, authenticated;

create or replace function public.nasheed_count_play(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then return false; end if;
  if not exists (select 1 from public.nasheed_tracks t where t.id = p_id and t.kind = 'STREAM' and t.status = 'APPROVED' and t.active) then
    return false;
  end if;
  insert into public.nasheed_plays (track_id, user_id, last_at) values (p_id, me, now())
  on conflict (track_id, user_id) do update set last_at = now() where public.nasheed_plays.last_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.nasheed_tracks set play_count = play_count + 1 where id = p_id;
  return true;
end $$;
revoke all on function public.nasheed_count_play(uuid) from public, anon;
grant execute on function public.nasheed_count_play(uuid) to authenticated;

-- ─── Capacity: over 30 public tracks → the track to move (or none) ────────────────────────────────────────────────
-- A member's track (submitted_by), approved over 7 days ago, its file in the public bucket — the fewest plays, then the
-- oldest approval. Null when the library is within 30, or every member track is still in its first 7 days.
create or replace function public.bot_nasheed_overflow(p_key text, p_cap int default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  total int;
  r public.nasheed_tracks;
begin
  perform public.require_bot(p_key);
  select count(*) into total from public.nasheed_tracks t where t.kind = 'STREAM' and t.status = 'APPROVED' and t.active;
  if total <= p_cap then return jsonb_build_object('total', total, 'track', null); end if;
  select * into r from public.nasheed_tracks t
   where t.kind = 'STREAM' and t.status = 'APPROVED' and t.active and t.submitted_by is not null
     and t.reviewed_at < now() - interval '7 days' and t.audio_path like 'community/%'
   order by t.play_count asc, t.reviewed_at asc
   limit 1;
  return jsonb_build_object('total', total, 'track', case when r.id is null then null else to_jsonb(r) end);
end $$;
revoke all on function public.bot_nasheed_overflow(text, int) from public, anon, authenticated;
grant execute on function public.bot_nasheed_overflow(text, int) to anon, authenticated;

-- Moved into its submitter's private tracks (the server has copied the file to «<submitter>/<uuid>.ext»): PRIVATE,
-- inactive, demoted_at; a bell notice in their Personal space; their Telegram chat back for the note. Audited.
create or replace function public.bot_nasheed_demote(p_key text, p_id uuid, p_own_path text, p_title text, p_message text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.nasheed_tracks;
  ws uuid;
  chat bigint;
begin
  perform public.require_bot(p_key);
  update public.nasheed_tracks t
     set status = 'PRIVATE', active = false, audio_path = 'own:' || p_own_path, demoted_at = now()
   where t.id = p_id and t.status = 'APPROVED' and t.submitted_by is not null
     and split_part(p_own_path, '/', 1) = t.submitted_by::text
     and p_own_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|aac)$'
  returning * into r;
  if r.id is null then return null; end if;
  select w.id into ws from public.workspaces w where w.user_id = r.submitted_by and w.type = 'PERSONAL';
  if ws is not null then
    insert into public.notifications (workspace_id, title, message, type) values (ws, left(p_title, 200), left(p_message, 1000), 'SYSTEM');
  end if;
  select l.chat_id into chat from public.telegram_links l where l.user_id = r.submitted_by limit 1;
  perform public.audit('NASHEED_DEMOTE', null, left(r.title_km || ' · ' || r.play_count || ' plays → the submitter''s own tracks', 500), r.id::text, null);
  return jsonb_build_object('chat_id', chat, 'title', r.title_km, 'play_count', r.play_count);
end $$;
revoke all on function public.bot_nasheed_demote(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_nasheed_demote(text, uuid, text, text, text) to anon, authenticated;

-- ─── The submitter at a glance: name, phone or Telegram @, their chat — for the review card and the thank-you ─────
create or replace function public.bot_member_contact(p_key text, p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  phone text;
begin
  perform public.require_bot(p_key);
  select case when u.email like '%@phone.luy.ibmserp.com' then '+' || split_part(u.email::text, '@', 1) end into phone from auth.users u where u.id = p_user;
  return jsonb_build_object(
    'name', coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = p_user), phone, '—'),
    'contact', coalesce(phone, (select '@' || l.username from public.telegram_links l where l.user_id = p_user and nullif(l.username, '') is not null limit 1)),
    'chat_id', (select l.chat_id from public.telegram_links l where l.user_id = p_user limit 1),
    'islamic', coalesce((select s.enabled from public.islamic_settings s where s.user_id = p_user), false)
  );
end $$;
revoke all on function public.bot_member_contact(text, uuid) from public, anon, authenticated;
grant execute on function public.bot_member_contact(text, uuid) to anon, authenticated;
