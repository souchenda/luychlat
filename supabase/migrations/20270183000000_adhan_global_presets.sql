-- Adhan recordings the admin publishes for everyone (founder, 19/10/2026 — no code change, no deploy): in the prayer
-- alert settings the super admin picks a file and chooses «ដាក់ចូលអេប ប្រើរួមគ្នាទាំងអស់»; the server cleans it (MP3,
-- −16 LUFS) into the public bucket «adhan-audio» and it appears in every member's Adhan list beside the bundled ones.
-- «សម្រាប់តែឧបករណ៍នេះ» (and every regular member) keeps the file on the phone only, as before. The name, who recited it
-- and who cleared it are required; only the super admin writes; every change is audited.

create table if not exists public.adhan_presets (
  id          uuid primary key default gen_random_uuid(),
  name_km     text not null check (char_length(btrim(name_km)) between 2 and 80),
  name_en     text check (name_en is null or char_length(name_en) <= 80),
  credit      text not null check (char_length(btrim(credit)) between 2 and 200),
  rights_note text not null check (char_length(btrim(rights_note)) between 5 and 500),
  audio_path  text not null unique check (audio_path ~ '^[0-9a-f-]{36}\.mp3$'),
  sort        int not null default 100,
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.adhan_presets enable row level security;
revoke all on public.adhan_presets from public, anon, authenticated;
grant select on public.adhan_presets to authenticated;
drop policy if exists adhan_presets_read on public.adhan_presets;
create policy adhan_presets_read on public.adhan_presets for select to authenticated using (active);

-- Public to read (played by alerts, kept offline); written only by the server's service key after the super admin check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adhan-audio', 'adhan-audio', true, 15728640, array['audio/mpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.adhan_preset_add(p_name_km text, p_name_en text, p_credit text, p_rights text, p_path text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  insert into public.adhan_presets (name_km, name_en, credit, rights_note, audio_path, created_by)
  values (btrim(p_name_km), nullif(btrim(coalesce(p_name_en, '')), ''), btrim(p_credit), btrim(p_rights), p_path, auth.uid())
  returning id into new_id;
  perform public.audit('adhan_preset_add', null, btrim(p_name_km) || ' · ' || btrim(p_credit), p_path);
  return new_id;
end $$;
revoke all on function public.adhan_preset_add(text, text, text, text, text) from public, anon;
grant execute on function public.adhan_preset_add(text, text, text, text, text) to authenticated;

-- Taken off for everyone (members who chose it fall back to the first bundled Adhan); its file's path back to delete.
create or replace function public.adhan_preset_remove(p_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  old_path text;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  delete from public.adhan_presets a where a.id = p_id returning a.audio_path into old_path;
  if old_path is not null then perform public.audit('adhan_preset_remove', null, p_id::text, old_path); end if;
  return old_path;
end $$;
revoke all on function public.adhan_preset_remove(uuid) from public, anon;
grant execute on function public.adhan_preset_remove(uuid) to authenticated;

select public.apply_security_gate();
