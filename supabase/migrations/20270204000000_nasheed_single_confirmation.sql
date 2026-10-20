-- Community qasidah: one confirmation (founder, 20/10/2026 — «How can she tick that she recorded it herself? These are
-- nasheeds found on the internet to listen to»). A member confirms only that it is an authentic Islamic qasidah /
-- nasheed with nothing contrary to the faith; the recording is shared for listening in the community, not for profit,
-- and removed at once on its original owner's request (Notice & Take-down). p_rights is kept in the signature (the
-- server passes null) and is no longer required. The founder's ✅ in Telegram still decides what is published.
create or replace function public.nasheed_submit(p_title text, p_artist text, p_path text, p_authentic boolean, p_rights boolean)
returns public.nasheed_tracks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.nasheed_tracks;
begin
  if me is null then raise exception 'sign in' using errcode = '42501'; end if;
  if not coalesce(p_authentic, false) then raise exception 'confirmation required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_artist, ''))) not between 1 and 120 then
    raise exception 'title and artist' using errcode = '22023';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> me::text or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|aac)$' then
    raise exception 'bad path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'nasheed-submissions' and o.name = p_path) then
    raise exception 'file missing' using errcode = '22023';
  end if;
  if (select count(*) from public.nasheed_tracks t where t.submitted_by = me and t.status = 'PENDING') >= 3 then
    raise exception 'too many pending' using errcode = '22023';
  end if;
  insert into public.nasheed_tracks (kind, title_km, artist, audio_path, rights_note, status, submitted_by, created_by, sort)
  values ('STREAM', btrim(p_title), btrim(p_artist), 'sub:' || p_path,
          'Member confirmed: authentic Islamic qasidah / nasheed; shared for non-commercial community listening under Notice & Take-down ('
            || to_char(now() at time zone 'Asia/Phnom_Penh', 'DD/MM/YYYY') || ')',
          'PENDING', me, me, 100)
  returning * into r;
  return r;
end $$;
revoke all on function public.nasheed_submit(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.nasheed_submit(text, text, text, boolean, boolean) to authenticated;
