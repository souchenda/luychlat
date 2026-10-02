-- Community places (mosques, surau, halal food): a photo per suggestion.
-- Private bucket place-photos, path <uploader id>/<file>. The uploader and
-- admins see it while the place waits for review; once an admin approves the
-- place, every signed-in user can. Places are shown on an OpenStreetMap map.

alter table public.islamic_places add column if not exists photo_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'islamic_places_photo_path_check') then
    alter table public.islamic_places add constraint islamic_places_photo_path_check
      check (photo_path is null or (char_length(photo_path) <= 200 and photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists place_photos_insert on storage.objects;
create policy place_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'place-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists place_photos_select on storage.objects;
create policy place_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'place-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or exists (select 1 from public.islamic_places p where p.photo_path = objects.name and p.approved)
    )
  );

drop policy if exists place_photos_delete on storage.objects;
create policy place_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'place-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- A suggestion may only point at the suggester's own upload (admins: any).
create or replace function public.guard_place_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.photo_path is not distinct from old.photo_path then
    return new;
  end if;
  if split_part(new.photo_path, '/', 1) <> coalesce((select auth.uid())::text, '') then
    raise exception 'photo must be your own upload' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists islamic_places_guard_photo on public.islamic_places;
create trigger islamic_places_guard_photo
  before insert or update of photo_path on public.islamic_places
  for each row execute function public.guard_place_photo();

select public.apply_security_gate();
