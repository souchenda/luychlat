-- The card & document vault standard (src/lib/id-card.ts): the physical photo is the ground truth,
-- what is read from it only an index. Every card has `verified_by_user` (the user checked it
-- against the card and saved) and `is_uncertain` (the reader left a "?" it couldn't make out).
-- NSSF cards stay in nssf_members; national ID, driving licence, vehicle registration, insurance
-- and bank cards go in id_cards — private to the account, like the NSSF vault.

alter table public.nssf_members add column if not exists verified_by_user boolean not null default false;
alter table public.nssf_members add column if not exists is_uncertain boolean not null default false;

create table if not exists public.id_cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind             text not null check (kind in ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REG', 'INSURANCE', 'BANK_CARD')),
  holder_kh        text check (holder_kh is null or char_length(holder_kh) <= 80),
  holder_en        text check (holder_en is null or (char_length(holder_en) <= 80 and holder_en ~ '^[A-Za-z][A-Za-z .''-]*$')),
  doc_number       text check (doc_number is null or (char_length(doc_number) <= 40 and doc_number ~ '^[A-Za-z0-9ក-៹ ./-]*$')),
  dob              date,
  gender           text check (gender is null or gender in ('MALE', 'FEMALE')),
  issued_on        date,
  expires_on       date,
  issuer           text check (issuer is null or char_length(issuer) <= 80),
  -- Kind-specific: plate, make, model, color, year, license_class, plan, last4 (bank: the last 4 digits only).
  details          jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000),
  qr_text          text check (qr_text is null or char_length(qr_text) <= 2000),
  front_path       text check (front_path is null or char_length(front_path) <= 200),
  back_path        text check (back_path is null or char_length(back_path) <= 200),
  verified_by_user boolean not null default false,
  is_uncertain     boolean not null default false,
  note             text check (note is null or char_length(note) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (holder_kh is not null or holder_en is not null or doc_number is not null or issuer is not null),
  -- A bank card never keeps a photo (the number on the front, the CVV on the back) nor a full number.
  check (kind <> 'BANK_CARD' or (front_path is null and back_path is null and doc_number is null
    and (details->>'last4' is null or details->>'last4' ~ '^\d{4}$')))
);
create index if not exists id_cards_user_idx on public.id_cards (user_id);
alter table public.id_cards enable row level security;

drop policy if exists id_cards_own on public.id_cards;
create policy id_cards_own on public.id_cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.id_cards from anon;
grant select, insert, update, delete on public.id_cards to authenticated;

-- Photos in the owner's own folder; at most 30 cards per account.
create or replace function public.guard_id_card()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.front_path is not null and new.front_path not like new.user_id::text || '/%')
     or (new.back_path is not null and new.back_path not like new.user_id::text || '/%') then
    raise exception 'invalid photo path' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.id_cards c where c.user_id = new.user_id) >= 30 then
    raise exception 'too many cards' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists id_cards_guard on public.id_cards;
create trigger id_cards_guard before insert or update on public.id_cards
  for each row execute function public.guard_id_card();

-- Full-resolution card photos (the straightened card, ≈ 1–2 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-cards', 'id-cards', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
update storage.buckets set file_size_limit = 10485760 where id = 'nssf-cards';

drop policy if exists id_cards_select on storage.objects;
create policy id_cards_select on storage.objects
  for select to authenticated
  using (bucket_id = 'id-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());
drop policy if exists id_cards_insert on storage.objects;
create policy id_cards_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());
drop policy if exists id_cards_delete on storage.objects;
create policy id_cards_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'id-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.access_ok());

select public.apply_security_gate();
