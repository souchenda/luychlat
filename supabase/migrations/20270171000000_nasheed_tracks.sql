-- Qasidah & Nasheed in the Islamic hub (founder, 18/10/2026). Two kinds of entry:
--   • STREAM — a recording we hold the rights to (a Cham qasidah group, a mosque, a licensed track): played in
--     the app from the public bucket «nasheed-audio». Its rights note (who granted permission, when) is required.
--   • LINK — a commercial artist's OFFICIAL channel or album (YouTube Music, Spotify…): opened there, never
--     streamed by us.
-- Everyone signed in can listen; only the super admin adds, edits or removes entries and audio.

create table if not exists public.nasheed_tracks (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('STREAM', 'LINK')),
  title_km    text not null check (char_length(title_km) between 1 and 120),
  title_en    text check (title_en is null or char_length(title_en) <= 120),
  artist      text not null check (char_length(artist) between 1 and 120),
  audio_path  text check (audio_path is null or char_length(audio_path) <= 300),
  url         text check (url is null or (char_length(url) <= 500 and url ~ '^https://')),
  rights_note text check (rights_note is null or char_length(rights_note) <= 500),
  sort        int not null default 100,
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- A streamed track has its audio AND who cleared it; a link has its official address.
  constraint nasheed_stream_rights check (kind <> 'STREAM' or (audio_path is not null and rights_note is not null and char_length(btrim(rights_note)) >= 5)),
  constraint nasheed_link_url check (kind <> 'LINK' or url is not null)
);
alter table public.nasheed_tracks enable row level security;
revoke all on public.nasheed_tracks from public, anon, authenticated;
grant select, insert, update, delete on public.nasheed_tracks to authenticated;
drop policy if exists nasheed_tracks_read on public.nasheed_tracks;
create policy nasheed_tracks_read on public.nasheed_tracks for select to authenticated using (active or public.is_super_admin());
drop policy if exists nasheed_tracks_write on public.nasheed_tracks;
create policy nasheed_tracks_write on public.nasheed_tracks for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The cleared recordings: public to read (streamed by the player), written only by the super admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nasheed-audio', 'nasheed-audio', true, 31457280, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nasheed_audio_write on storage.objects;
create policy nasheed_audio_write on storage.objects for insert to authenticated
  with check (bucket_id = 'nasheed-audio' and public.is_super_admin());
drop policy if exists nasheed_audio_update on storage.objects;
create policy nasheed_audio_update on storage.objects for update to authenticated
  using (bucket_id = 'nasheed-audio' and public.is_super_admin());
drop policy if exists nasheed_audio_delete on storage.objects;
create policy nasheed_audio_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nasheed-audio' and public.is_super_admin());

-- The official channel we are sure of; the founder adds more from the hub.
insert into public.nasheed_tracks (kind, title_km, title_en, artist, url, sort)
select 'LINK', 'ឆានែលផ្លូវការ Maher Zain', 'Maher Zain — official channel', 'Maher Zain', 'https://www.youtube.com/@MaherZain', 10
where not exists (select 1 from public.nasheed_tracks where url = 'https://www.youtube.com/@MaherZain');

-- The account gate (suspended accounts, required 2FA) on the new table too.
select public.apply_security_gate();
