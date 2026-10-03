-- Statement files are read on the device and never uploaded, so the server
-- never holds one. When the device's safety check refuses a file (a program,
-- a macro workbook, a zip bomb, a PDF with scripts, a disguised file), it
-- reports it here: one row per refusal (reason only — never the file or its
-- name), a security event for /admin › System health, and after 3 refusals in
-- 24 hours statement import is paused for that account for 24 hours.

create table if not exists public.upload_rejections (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  reason  text not null check (reason in ('executable', 'macro', 'embedded', 'zip_bomb', 'pdf_active', 'mismatch', 'extension')),
  format  text not null default '' check (char_length(format) <= 8),
  size_kb integer not null default 0 check (size_kb >= 0)
);
create index if not exists upload_rejections_user_idx on public.upload_rejections (user_id, at desc);
alter table public.upload_rejections enable row level security;
revoke all on public.upload_rejections from anon, authenticated;

-- When the caller's statement import is paused until, or null.
create or replace function public.statement_import_blocked_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) >= 3 then max(r.at) + interval '24 hours' end
  from public.upload_rejections r
  where r.user_id = (select auth.uid()) and r.at > now() - interval '24 hours';
$$;
revoke all on function public.statement_import_blocked_until() from public, anon;
grant execute on function public.statement_import_blocked_until() to authenticated;

-- The device refused a file: record it, tell the admins, maybe pause imports.
create or replace function public.report_unsafe_upload(p_reason text, p_format text default '', p_size_kb integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  recent integer;
begin
  if uid is null or not public.access_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into recent from public.upload_rejections where user_id = uid and at > now() - interval '24 hours';
  -- Already paused: nothing more is written, so this can't flood the log.
  if recent < 3 then
    insert into public.upload_rejections (user_id, reason, format, size_kb)
    values (uid, p_reason, lower(left(regexp_replace(coalesce(p_format, ''), '[^a-zA-Z0-9]', '', 'g'), 8)), greatest(0, least(coalesce(p_size_kb, 0), 1000000)));
    recent := recent + 1;
    insert into public.server_events (level, source, message)
    values ('security', 'upload', format('Unsafe statement file refused (%s, .%s, %s KB) · user %s%s',
      p_reason, coalesce(nullif(lower(left(regexp_replace(coalesce(p_format, ''), '[^a-zA-Z0-9]', '', 'g'), 8)), ''), '?'),
      greatest(0, coalesce(p_size_kb, 0)), left(uid::text, 8),
      case when recent >= 3 then ' — import paused 24 h' else '' end));
    delete from public.upload_rejections where at < now() - interval '30 days';
  end if;
  return jsonb_build_object('blocked_until', public.statement_import_blocked_until());
end;
$$;
revoke all on function public.report_unsafe_upload(text, text, integer) from public, anon;
grant execute on function public.report_unsafe_upload(text, text, integer) to authenticated;

select public.apply_security_gate();
