-- Qasidah & Nasheed, part 2 (founder, 18/10/2026):
--   • three CC-licensed recordings from Wikimedia Commons, served by the app itself (/audio/nasheed/…), each
--     with its credit and licence shown under the title (the CC licences require it);
--   • members share a qasidah: the file goes to the PRIVATE bucket «nasheed-submissions», the track is PENDING
--     and seen only by its submitter and the super admin until the founder taps ✅ in Telegram (the server then
--     copies it into the public bucket); ❌ rejects it and the file is deleted;
--   • ❤️ likes: one per person per track, counted on the track, so the community's favourites rise.

alter table public.nasheed_tracks add column if not exists status text not null default 'APPROVED';
alter table public.nasheed_tracks drop constraint if exists nasheed_tracks_status_check;
alter table public.nasheed_tracks add constraint nasheed_tracks_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED'));
alter table public.nasheed_tracks add column if not exists credit text check (credit is null or char_length(credit) <= 200);
alter table public.nasheed_tracks add column if not exists submitted_by uuid references auth.users (id) on delete set null;
alter table public.nasheed_tracks add column if not exists likes int not null default 0 check (likes >= 0);
alter table public.nasheed_tracks add column if not exists reviewed_at timestamptz;
alter table public.nasheed_tracks add column if not exists notified boolean not null default false;

-- Everyone signed in sees the approved, active tracks; a submitter also sees their own; the super admin all.
drop policy if exists nasheed_tracks_read on public.nasheed_tracks;
create policy nasheed_tracks_read on public.nasheed_tracks for select to authenticated
  using ((active and status = 'APPROVED') or submitted_by = auth.uid() or public.is_super_admin());

-- ─── Members' submissions: private files, own folder, 20 MB ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nasheed-submissions', 'nasheed-submissions', false, 20971520, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nasheed_sub_insert on storage.objects;
create policy nasheed_sub_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nasheed-submissions' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists nasheed_sub_read on storage.objects;
create policy nasheed_sub_read on storage.objects for select to authenticated
  using (bucket_id = 'nasheed-submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
drop policy if exists nasheed_sub_delete on storage.objects;
create policy nasheed_sub_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nasheed-submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

-- A member's submission: both confirmations, their own uploaded file, at most 3 waiting at a time.
create or replace function public.nasheed_submit(p_title text, p_artist text, p_path text, p_authentic boolean, p_rights boolean)
returns public.nasheed_tracks
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.nasheed_tracks;
begin
  if me is null then raise exception 'sign in' using errcode = '42501'; end if;
  if not coalesce(p_authentic, false) or not coalesce(p_rights, false) then raise exception 'confirmations required' using errcode = '22023'; end if;
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
          'Member confirmed: authentic Islamic qasidah / nasheed, own recording or permission to share (' || to_char(now() at time zone 'Asia/Phnom_Penh', 'DD/MM/YYYY') || ')',
          'PENDING', me, me, 100)
  returning * into r;
  return r;
end $$;
revoke all on function public.nasheed_submit(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.nasheed_submit(text, text, text, boolean, boolean) to authenticated;

-- The founder's ✅ / ❌ from Telegram (only a super admin's chat). Leaves PENDING exactly once. On approve the
-- server has already copied the file to the public bucket and passes its new path.
create or replace function public.bot_nasheed_review(p_key text, p_id uuid, p_approve boolean, p_chat_id bigint, p_public_path text default null)
returns public.nasheed_tracks
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  r public.nasheed_tracks;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_super_admin(p_chat_id);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_approve and (p_public_path is null or p_public_path !~ '^community/[0-9a-f-]{36}\.(mp3|m4a|aac)$') then
    raise exception 'bad path' using errcode = '22023';
  end if;
  update public.nasheed_tracks t
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         audio_path = case when p_approve then p_public_path else t.audio_path end,
         active = p_approve,
         reviewed_at = now()
   where t.id = p_id and t.status = 'PENDING'
  returning * into r;
  return r;
end $$;
revoke all on function public.bot_nasheed_review(text, uuid, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.bot_nasheed_review(text, uuid, boolean, bigint, text) to anon, authenticated;

-- ─── ❤️ Likes ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.nasheed_likes (
  track_id   uuid not null references public.nasheed_tracks (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);
alter table public.nasheed_likes enable row level security;
revoke all on public.nasheed_likes from public, anon, authenticated;
grant select, insert, delete on public.nasheed_likes to authenticated;
drop policy if exists nasheed_likes_own on public.nasheed_likes;
create policy nasheed_likes_own on public.nasheed_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.nasheed_tracks t where t.id = track_id and t.status = 'APPROVED' and t.active));

create or replace function public.nasheed_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.nasheed_tracks set likes = likes + 1 where id = new.track_id;
  else
    update public.nasheed_tracks set likes = greatest(likes - 1, 0) where id = old.track_id;
  end if;
  return null;
end $$;
drop trigger if exists nasheed_like_count on public.nasheed_likes;
create trigger nasheed_like_count after insert or delete on public.nasheed_likes for each row execute function public.nasheed_like_count();

-- ─── The three Commons recordings (files in /public/audio/nasheed, SHA-1 checked against Commons) ──────────
insert into public.nasheed_tracks (kind, title_km, title_en, artist, audio_path, rights_note, credit, sort)
select v.* from (values
  ('STREAM', 'អាល់ហាំឌូលីឡាហ៍ (សំឡេងតែប៉ុណ្ណោះ)', 'Alhamdulillah (vocal only)', 'Jawad Syed', '/audio/nasheed/alhamdulillah-jawad-syed.mp3',
   'Wikimedia Commons File:Jawad Syed - Alhamdulilah (Vocal Only Nasheed).flac — CC BY 3.0 via the artist''s YouTube (SyedsLife); SHA-1 ea03dcc4…',
   'SyedsLife · Wikimedia Commons · CC BY 3.0', 20),
  ('STREAM', 'រ៉ុបបាណា សូលលី (សូឡាវ៉ាត់ រេបាណា)', 'Robbana Sholli (rebana sholawat)', 'El Mafaz', '/audio/nasheed/robbana-sholli-el-mafaz.mp3',
   'Wikimedia Commons File:El Mafaz - Robbana Sholli.ogg — CC BY-SA 4.0, own work of Dwikanov; SHA-1 27d6794d…',
   'Dwikanov · Wikimedia Commons · CC BY-SA 4.0', 30),
  ('STREAM', 'សរសើរអល់ឡោះមុនពេលរះអរុណ (យេម៉ែន)', 'Praise God before dawn (Yemen)', 'Yyaabb', '/audio/nasheed/praise-before-dawn-yemen.mp3',
   'Wikimedia Commons File:Praise God before dawn.wav — CC BY-SA 4.0, own work of Yyaabb; SHA-1 c0e14085…',
   'Yyaabb · Wikimedia Commons · CC BY-SA 4.0', 40)
) as v(kind, title_km, title_en, artist, audio_path, rights_note, credit, sort)
where not exists (select 1 from public.nasheed_tracks t where t.audio_path = v.audio_path);

select public.apply_security_gate();
