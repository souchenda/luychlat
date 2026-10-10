-- «ប្រាប់ទូ ATM ដែលខ្វះ»: people standing at an ATM the finder doesn't know send its GPS point and
-- bank (from /atms or the bot); a super admin approves it from a Telegram card, and only then is it
-- added to bank_atms (source 'community' — the weekly OpenStreetMap refresh replaces 'osm' rows only).
-- Never a guessed coordinate: only a point a person sent from the spot, checked by an admin.

create table if not exists public.atm_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  chat_id     bigint,
  bank_code   text not null check (bank_code in ('ABA', 'ACLEDA', 'CANADIA', 'WING', 'SATHAPANA')),
  latitude    double precision not null check (latitude between 9.5 and 15),
  longitude   double precision not null check (longitude between 102 and 108),
  accuracy_m  integer check (accuracy_m is null or accuracy_m between 0 and 100000),
  note        text check (note is null or char_length(note) <= 120),
  status      text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE')),
  atm_ref     text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  check (user_id is not null or chat_id is not null)
);
create index if not exists atm_reports_pending_idx on public.atm_reports (created_at) where status = 'PENDING';
alter table public.atm_reports enable row level security;
revoke all on public.atm_reports from anon, authenticated;
grant select on public.atm_reports to authenticated;
drop policy if exists atm_reports_own on public.atm_reports;
create policy atm_reports_own on public.atm_reports for select to authenticated using (user_id = (select auth.uid()));

-- At most 10 reports a day per person (or chat).
create or replace function public.atm_report_allowed(p_user uuid, p_chat bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.atm_reports r
          where (r.user_id = p_user or r.chat_id = p_chat) and r.created_at > now() - interval '1 day') < 10
$$;
revoke all on function public.atm_report_allowed(uuid, bigint) from public, anon, authenticated;

-- From the app (signed in): the report; the server then sends the admins' card.
create or replace function public.submit_atm_report(p_bank text, p_lat double precision, p_lng double precision, p_accuracy integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
begin
  if uid is null or not public.access_ok() then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.atm_report_allowed(uid, null) then raise exception 'too_many' using errcode = 'P0001'; end if;
  insert into public.atm_reports (user_id, bank_code, latitude, longitude, accuracy_m, note)
  values (uid, p_bank, p_lat, p_lng, p_accuracy, nullif(left(btrim(coalesce(p_note, '')), 120), ''))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_atm_report(text, double precision, double precision, integer, text) from public, anon;
grant execute on function public.submit_atm_report(text, double precision, double precision, integer, text) to authenticated;

-- From the bot (any private chat, linked or not).
create or replace function public.bot_atm_report(p_key text, p_chat_id bigint, p_bank text, p_lat double precision, p_lng double precision, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  new_id uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if not public.atm_report_allowed(link.uid, p_chat_id) then raise exception 'too_many' using errcode = 'P0001'; end if;
  insert into public.atm_reports (user_id, chat_id, bank_code, latitude, longitude, note)
  values (link.uid, p_chat_id, p_bank, p_lat, p_lng, nullif(left(btrim(coalesce(p_note, '')), 120), ''))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.bot_atm_report(text, bigint, text, double precision, double precision, text) from public;
grant execute on function public.bot_atm_report(text, bigint, text, double precision, double precision, text) to anon, authenticated;

-- A report, for the admins' card and the review.
create or replace function public.bot_atm_report_get(p_key text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return (select to_jsonb(r) - 'user_id' from public.atm_reports r where r.id = p_id);
end;
$$;
revoke all on function public.bot_atm_report_get(text, uuid) from public;
grant execute on function public.bot_atm_report_get(text, uuid) to anon, authenticated;

-- A super admin's decision from the card. Approve: the ATM goes into bank_atms (unless one of the
-- same bank is already within 50 m — then DUPLICATE). Audited either way.
create or replace function public.bot_atm_review(p_key text, p_chat_id bigint, p_id uuid, p_approve boolean, p_province text, p_province_km text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid;
  r public.atm_reports;
  label text;
  ref text;
  near text;
begin
  perform public.require_bot(p_key);
  select l.user_id into admin from public.telegram_links l join public.app_admins a on a.user_id = l.user_id and a.role = 'super_admin' where l.chat_id = p_chat_id limit 1;
  if admin is null then return jsonb_build_object('status', 'forbidden'); end if;
  select * into r from public.atm_reports where id = p_id for update;
  if r.id is null then return jsonb_build_object('status', 'missing'); end if;
  if r.status <> 'PENDING' then return jsonb_build_object('status', 'done', 'was', r.status, 'chat_id', r.chat_id); end if;

  if not p_approve then
    update public.atm_reports set status = 'REJECTED', reviewed_by = admin, reviewed_at = now() where id = r.id;
    perform public.audit('ATM_REPORT_REJECTED', r.id, r.bank_code || ' ' || round(r.latitude::numeric, 5) || ',' || round(r.longitude::numeric, 5), null, admin, null);
    return jsonb_build_object('status', 'rejected', 'chat_id', r.chat_id);
  end if;

  -- ~50 m: the same machine already known.
  select a.osm_ref into near from public.bank_atms a
  where a.bank_code = r.bank_code and abs(a.latitude - r.latitude) < 0.00045 and abs(a.longitude - r.longitude) < 0.00045 limit 1;
  if near is not null then
    update public.atm_reports set status = 'DUPLICATE', atm_ref = near, reviewed_by = admin, reviewed_at = now() where id = r.id;
    return jsonb_build_object('status', 'duplicate', 'ref', near, 'chat_id', r.chat_id);
  end if;

  label := case r.bank_code when 'CANADIA' then 'Canadia' when 'SATHAPANA' then 'Sathapana' when 'WING' then 'Wing' else r.bank_code end;
  ref := 'c' || replace(r.id::text, '-', '');
  insert into public.bank_atms (osm_ref, bank_code, type, name_kh, name_en, address, province, province_km, latitude, longitude, currencies, is_24h, source)
  values (ref, r.bank_code, 'ATM', r.note, label || ' ATM', r.note, p_province, p_province_km, round(r.latitude::numeric, 6), round(r.longitude::numeric, 6), null, true, 'community');
  update public.atm_reports set status = 'APPROVED', atm_ref = ref, reviewed_by = admin, reviewed_at = now() where id = r.id;
  perform public.audit('ATM_REPORT_APPROVED', r.id, r.bank_code || ' ' || round(r.latitude::numeric, 5) || ',' || round(r.longitude::numeric, 5), ref, admin, jsonb_build_object('note', r.note));
  return jsonb_build_object('status', 'approved', 'ref', ref, 'chat_id', r.chat_id);
end;
$$;
revoke all on function public.bot_atm_review(text, bigint, uuid, boolean, text, text) from public;
grant execute on function public.bot_atm_review(text, bigint, uuid, boolean, text, text) to anon, authenticated;

select public.apply_security_gate();
