-- Qasidah: 🌐 public or 🔒 private (founder, 20/10/2026). A member's upload either goes to the community library
-- (PENDING until the founder's ✅ in Telegram, as before) or stays theirs alone: status PRIVATE, playable at once, never
-- reviewed, never listed for anyone else — not even the super admins' lists. The file stays in the member's own folder
-- of the private bucket «nasheed-submissions» (audio_path «own:<user>/<uuid>.mp3»), played through a signed URL.

alter table public.nasheed_tracks drop constraint if exists nasheed_tracks_status_check;
alter table public.nasheed_tracks add constraint nasheed_tracks_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED', 'PRIVATE'));

-- Everyone sees the approved, active tracks; a member also sees their own; content managers every track but private ones
drop policy if exists nasheed_tracks_read on public.nasheed_tracks;
create policy nasheed_tracks_read on public.nasheed_tracks for select to authenticated
  using ((active and status = 'APPROVED') or submitted_by = auth.uid() or (public.is_content_manager() and status <> 'PRIVATE'));

-- 🔒 Keep for my own listening: their own uploaded file, at most 50 private tracks.
create or replace function public.nasheed_save_private(p_title text, p_artist text, p_path text)
returns public.nasheed_tracks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.nasheed_tracks;
begin
  if me is null then raise exception 'sign in' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_artist, ''))) not between 1 and 120 then
    raise exception 'title and artist' using errcode = '22023';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> me::text or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|aac)$' then
    raise exception 'bad path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'nasheed-submissions' and o.name = p_path) then
    raise exception 'file missing' using errcode = '22023';
  end if;
  if (select count(*) from public.nasheed_tracks t where t.submitted_by = me and t.status = 'PRIVATE') >= 50 then
    raise exception 'too many private' using errcode = '22023';
  end if;
  insert into public.nasheed_tracks (kind, title_km, artist, audio_path, rights_note, status, active, submitted_by, created_by, sort)
  values ('STREAM', btrim(p_title), btrim(p_artist), 'own:' || p_path, 'Private: the member''s own listening only — never shown to others',
          'PRIVATE', false, me, me, 100)
  returning * into r;
  return r;
end $$;
revoke all on function public.nasheed_save_private(text, text, text) from public, anon;
grant execute on function public.nasheed_save_private(text, text, text) to authenticated;

-- 🗑 One of my private tracks: the row goes; its file path is returned for the app to delete (own folder — policy).
create or replace function public.nasheed_delete_private(p_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  path text;
begin
  delete from public.nasheed_tracks t where t.id = p_id and t.submitted_by = auth.uid() and t.status = 'PRIVATE'
  returning t.audio_path into path;
  return case when path like 'own:%' then substr(path, 5) else null end;
end $$;
revoke all on function public.nasheed_delete_private(uuid) from public, anon;
grant execute on function public.nasheed_delete_private(uuid) to authenticated;
