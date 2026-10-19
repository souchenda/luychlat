-- Du'a recordings from the admin (founder, 19/10/2026 — like the qasidah submissions): the super admin uploads one
-- recording per daily du'a (lib/duas.ts) from the du'a card («📤 បញ្ចូលសំឡេង») or sends it to @luychlat_bot
-- (/setdua). The server cleans it (MP3, −16 LUFS) into the public bucket «dua-audio»; once a du'a has a row here,
-- its 🔊 and «🔁 ទន្ទេញ» appear for everyone. Who recited it (credit) and who cleared it (rights note) are required.
-- Only the super admin writes; every change is audited.

create table if not exists public.dua_recordings (
  dua_id      text primary key check (dua_id ~ '^[a-z0-9-]{2,40}$'),
  audio_path  text not null check (audio_path ~ '^[a-z0-9-]{2,40}-[0-9]{10,14}\.mp3$'),
  credit      text not null check (char_length(btrim(credit)) between 2 and 200),
  rights_note text not null check (char_length(btrim(rights_note)) between 5 and 500),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.dua_recordings enable row level security;
revoke all on public.dua_recordings from public, anon, authenticated;
grant select on public.dua_recordings to authenticated;
drop policy if exists dua_recordings_read on public.dua_recordings;
create policy dua_recordings_read on public.dua_recordings for select to authenticated using (true);

-- The cleaned recordings: public to read (played and kept offline); written only by the server (service key)
-- after the super admin check — no storage policy lets a signed-in member write here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dua-audio', 'dua-audio', true, 10485760, array['audio/mpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- One write for the app and the bot: the new recording, the old file's path back (the server deletes it).
create or replace function public.dua_recording_put(p_actor uuid, p_dua text, p_path text, p_credit text, p_rights text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  old_path text;
begin
  if p_actor is null or not exists (select 1 from public.app_admins a where a.user_id = p_actor and a.role = 'super_admin') then
    raise exception 'super admin only' using errcode = '42501';
  end if;
  if p_dua is null or p_path is null or p_path not like p_dua || '-%' then raise exception 'bad path' using errcode = '22023'; end if;
  select r.audio_path into old_path from public.dua_recordings r where r.dua_id = p_dua;
  insert into public.dua_recordings (dua_id, audio_path, credit, rights_note, updated_by, updated_at)
  values (p_dua, p_path, btrim(p_credit), btrim(p_rights), p_actor, now())
  on conflict (dua_id) do update set audio_path = excluded.audio_path, credit = excluded.credit, rights_note = excluded.rights_note,
                                     updated_by = excluded.updated_by, updated_at = now();
  perform public.audit('dua_recording_set', null, p_dua || ' · ' || btrim(p_credit), p_path, p_actor);
  return old_path;
end $$;
revoke all on function public.dua_recording_put(uuid, text, text, text, text) from public, anon, authenticated;

-- In the app: the signed-in super admin.
create or replace function public.dua_recording_set(p_dua text, p_path text, p_credit text, p_rights text)
returns text
language sql security definer set search_path = '' as $$
  select public.dua_recording_put(case when public.is_super_admin() then auth.uid() end, p_dua, p_path, p_credit, p_rights)
$$;
revoke all on function public.dua_recording_set(text, text, text, text) from public, anon;
grant execute on function public.dua_recording_set(text, text, text, text) to authenticated;

-- From Telegram: the super admin's linked private chat.
create or replace function public.bot_dua_recording_set(p_key text, p_chat_id bigint, p_dua text, p_path text, p_credit text, p_rights text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return public.dua_recording_put(public.tip_chat_super_admin(p_chat_id), p_dua, p_path, p_credit, p_rights);
end $$;
revoke all on function public.bot_dua_recording_set(text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_dua_recording_set(text, bigint, text, text, text, text) to anon, authenticated;

-- A wrong recording taken off (the 🔊 disappears); its file's path back for the server to delete.
create or replace function public.dua_recording_remove(p_dua text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  old_path text;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  delete from public.dua_recordings r where r.dua_id = p_dua returning r.audio_path into old_path;
  if old_path is not null then perform public.audit('dua_recording_remove', null, p_dua, old_path); end if;
  return old_path;
end $$;
revoke all on function public.dua_recording_remove(text) from public, anon;
grant execute on function public.dua_recording_remove(text) to authenticated;

select public.apply_security_gate();
