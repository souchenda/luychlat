-- Profile photo / phone / bio, the business profile of a BUSINESS workspace,
-- a private bucket for those images, and a directory of mosques, surau and
-- halal food places (admin-approved). Idempotent.

-- ---------------------------------------------------------------------------
-- Personal profile: photo (storage path), phone and a short bio. Visible to
-- the user and to people they share a workspace with (existing profiles_select).
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists bio text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_check') then
    alter table public.profiles add constraint profiles_avatar_path_check
      check (avatar_path is null or avatar_path like 'user/' || id::text || '/%');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_check') then
    alter table public.profiles add constraint profiles_phone_check
      check (phone is null or char_length(phone) <= 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_check') then
    alter table public.profiles add constraint profiles_bio_check
      check (bio is null or char_length(bio) <= 200);
  end if;
end $$;

grant update (avatar_path, phone, bio) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Business profile on the workspace row (the owner edits it; members read it).
-- The business name is the workspace name.
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists logo_path text;
alter table public.workspaces add column if not exists business_phone text;
alter table public.workspaces add column if not exists business_address text;
alter table public.workspaces add column if not exists business_industry text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_logo_path_check') then
    alter table public.workspaces add constraint workspaces_logo_path_check
      check (logo_path is null or logo_path like 'ws/' || id::text || '/%');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspaces_business_fields_check') then
    alter table public.workspaces add constraint workspaces_business_fields_check
      check (
        (business_phone is null or char_length(business_phone) <= 30)
        and (business_address is null or char_length(business_address) <= 200)
        and (business_industry is null or char_length(business_industry) <= 60)
      );
  end if;
end $$;

grant update (logo_path, business_phone, business_address, business_industry) on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- Images: private bucket, shown through short-lived signed URLs.
--   user/<user id>/<file>      personal photo: the user writes; people who
--                              share a workspace with them may view
--   ws/<workspace id>/<file>   business logo: the owner writes; members view
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.profile_image_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uid uuid := auth.uid();
  target uuid;
begin
  if uid is null or array_length(parts, 1) <> 3 or parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  target := parts[2]::uuid;
  if parts[1] = 'user' then
    return target = uid or (not p_write and public.shares_workspace_with(target));
  elsif parts[1] = 'ws' then
    if p_write then
      return exists (select 1 from public.workspaces w where w.id = target and w.user_id = uid and w.type = 'BUSINESS');
    end if;
    return public.is_workspace_member(target);
  end if;
  return false;
end;
$$;
revoke all on function public.profile_image_access(text, boolean) from public, anon;
grant execute on function public.profile_image_access(text, boolean) to authenticated;

drop policy if exists profile_images_select on storage.objects;
create policy profile_images_select on storage.objects
  for select to authenticated using (bucket_id = 'profile-images' and public.profile_image_access(name, false));
drop policy if exists profile_images_insert on storage.objects;
create policy profile_images_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'profile-images' and public.profile_image_access(name, true));
drop policy if exists profile_images_update on storage.objects;
create policy profile_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-images' and public.profile_image_access(name, true))
  with check (bucket_id = 'profile-images' and public.profile_image_access(name, true));
drop policy if exists profile_images_delete on storage.objects;
create policy profile_images_delete on storage.objects
  for delete to authenticated using (bucket_id = 'profile-images' and public.profile_image_access(name, true));

-- ---------------------------------------------------------------------------
-- Mosques, surau and halal food places. Signed-in users may suggest a place;
-- it is listed for everyone only after an admin approves it. Only admins can
-- mark a place as halal-certified.
-- ---------------------------------------------------------------------------
create table if not exists public.islamic_places (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('MOSQUE', 'SURAU', 'HALAL')),
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  province        text check (province is null or char_length(province) <= 40),
  address         text check (address is null or char_length(address) <= 300),
  lat             double precision check (lat is null or lat between -90 and 90),
  lng             double precision check (lng is null or lng between -180 and 180),
  phone           text check (phone is null or char_length(phone) <= 30),
  note            text check (note is null or char_length(note) <= 300),
  halal_certified boolean not null default false,
  approved        boolean not null default false,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists islamic_places_approved_idx on public.islamic_places (approved, kind);
alter table public.islamic_places enable row level security;

drop policy if exists islamic_places_select on public.islamic_places;
create policy islamic_places_select on public.islamic_places
  for select to authenticated
  using (approved or created_by = (select auth.uid()) or public.is_admin());
drop policy if exists islamic_places_insert on public.islamic_places;
create policy islamic_places_insert on public.islamic_places
  for insert to authenticated
  with check (
    public.is_admin()
    or (created_by = (select auth.uid()) and not approved and not halal_certified)
  );
drop policy if exists islamic_places_update on public.islamic_places;
create policy islamic_places_update on public.islamic_places
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists islamic_places_delete on public.islamic_places;
create policy islamic_places_delete on public.islamic_places
  for delete to authenticated
  using (public.is_admin() or (created_by = (select auth.uid()) and not approved));

grant select, insert, update, delete on public.islamic_places to authenticated;

-- At most 10 suggestions waiting for review per person (keeps the queue clean).
create or replace function public.limit_place_suggestions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.approved and not public.is_admin()
     and (select count(*) from public.islamic_places p where p.created_by = new.created_by and not p.approved) >= 10 then
    raise exception 'too many pending suggestions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists islamic_places_limit on public.islamic_places;
create trigger islamic_places_limit
  before insert on public.islamic_places
  for each row execute function public.limit_place_suggestions();
