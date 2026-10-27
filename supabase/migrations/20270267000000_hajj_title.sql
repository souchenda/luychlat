-- Task #524 (founder, 27/10/2026): the Hajj honorific in Islamic Mode — «ហាជ្ជី» / «ហាជ្ញះ» before the name in the
-- greeting and the Home header, only when the person says they completed the Hajj and chose the title (never inferred:
-- the profile has no gender). Private like the rest of islamic_settings (RLS: the owner only).
alter table public.islamic_settings
  add column if not exists has_completed_hajj boolean not null default false,
  add column if not exists hajj_title text;

alter table public.islamic_settings drop constraint if exists islamic_settings_hajj_title_check;
alter table public.islamic_settings
  add constraint islamic_settings_hajj_title_check check (hajj_title is null or hajj_title in ('haji', 'hajjah'));
