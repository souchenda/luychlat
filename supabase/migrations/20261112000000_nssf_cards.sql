-- NSSF card vault (កាត ប.ស.ស. ឌីជីថល): the account holder's own NSSF cards
-- and their dependents' — name, relationship, NSSF ID and optional card
-- photos for hospital check-in. Private to the account (not shared with
-- workspace members): rows by user_id, photos in a private bucket folder per
-- user, shown through short-lived signed URLs. The number of active members
-- also suggests the NSSF bill amount (15,600៛ × members, editable).

create table if not exists public.nssf_members (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  relationship text not null default 'self' check (relationship in ('self', 'spouse', 'child')),
  nssf_id      text check (nssf_id is null or (char_length(nssf_id) <= 40 and nssf_id ~ '^[A-Za-z0-9 ./-]*$')),
  front_path   text check (front_path is null or char_length(front_path) <= 200),
  back_path    text check (back_path is null or char_length(back_path) <= 200),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists nssf_members_user_idx on public.nssf_members (user_id);
alter table public.nssf_members enable row level security;

drop policy if exists nssf_members_own on public.nssf_members;
create policy nssf_members_own on public.nssf_members
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.nssf_members to authenticated;

-- Photos must be in the owner's own folder; at most 10 members per account.
create or replace function public.guard_nssf_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.front_path is not null and new.front_path not like new.user_id::text || '/%')
     or (new.back_path is not null and new.back_path not like new.user_id::text || '/%') then
    raise exception 'invalid photo path' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.nssf_members m where m.user_id = new.user_id) >= 10 then
    raise exception 'too many members' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists nssf_members_guard on public.nssf_members;
create trigger nssf_members_guard before insert or update on public.nssf_members
  for each row execute function public.guard_nssf_member();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nssf-cards', 'nssf-cards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nssf_cards_select on storage.objects;
create policy nssf_cards_select on storage.objects
  for select to authenticated
  using (bucket_id = 'nssf-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());
drop policy if exists nssf_cards_insert on storage.objects;
create policy nssf_cards_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nssf-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());
drop policy if exists nssf_cards_delete on storage.objects;
create policy nssf_cards_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'nssf-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());

select public.apply_security_gate();
