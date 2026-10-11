-- Vehicle documents (founder, 11/10/2026): ឆៀកឡាន (roadworthiness inspection), ពន្ធផ្លូវ (annual road
-- tax) and ធានារ៉ាប់រងយានយន្ត (insurance — Forte, AIA…), each with its expiry date and an estimated
-- cost. Strictly the Personal workspace (never a business). Reminders 30, 15 and 7 days before, on the
-- day and when expired — in the bell and on Telegram (the DUE_DATE notifications the bot delivers).
-- src/lib/vehicle-docs.ts mirrors the rules (vehicle-docs.test.ts).

create table if not exists public.vehicle_documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  vehicle      text not null check (char_length(btrim(vehicle)) between 1 and 60),
  doc_type     text not null check (doc_type in ('INSPECTION', 'ROAD_TAX', 'INSURANCE')),
  provider     text check (provider is null or char_length(provider) <= 60),
  expires_on   date not null,
  cost         numeric(15, 2) check (cost is null or cost > 0),
  currency     public.currency_code not null default 'USD',
  remind_days  integer[] not null default '{30,15,7}'
    check (array_length(remind_days, 1) <= 5 and 0 <= all (remind_days) and 90 >= all (remind_days)),
  notes        text check (notes is null or char_length(notes) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists vehicle_documents_workspace_idx on public.vehicle_documents (workspace_id);

/** Only a Personal workspace keeps vehicle documents. */
create or replace function public.is_personal_workspace(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspaces w where w.id = ws_id and w.type::text = 'PERSONAL')
$$;
revoke all on function public.is_personal_workspace(uuid) from public, anon;
grant execute on function public.is_personal_workspace(uuid) to authenticated;

alter table public.vehicle_documents enable row level security;
drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists vehicle_documents_insert on public.vehicle_documents;
create policy vehicle_documents_insert on public.vehicle_documents
  for insert to authenticated with check (public.can_write_workspace(workspace_id) and public.is_personal_workspace(workspace_id));
drop policy if exists vehicle_documents_update on public.vehicle_documents;
create policy vehicle_documents_update on public.vehicle_documents
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id) and public.is_personal_workspace(workspace_id));
drop policy if exists vehicle_documents_delete on public.vehicle_documents;
create policy vehicle_documents_delete on public.vehicle_documents
  for delete to authenticated using (public.can_write_workspace(workspace_id));
grant select, insert, update, delete on public.vehicle_documents to authenticated;

create or replace function public.vehicle_documents_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Insurance has a company; the other two never do.
  if new.doc_type <> 'INSURANCE' then
    new.provider := null;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicle_documents_touch on public.vehicle_documents;
create trigger vehicle_documents_touch before insert or update on public.vehicle_documents
  for each row execute function public.vehicle_documents_touch();

-- The reminders: one notification per document, expiry and stage (never twice).
alter table public.notifications add column if not exists vehicle_document_id uuid references public.vehicle_documents (id) on delete cascade;
create unique index if not exists notifications_vehicle_doc_alert_unique
  on public.notifications (vehicle_document_id, alert_key) where vehicle_document_id is not null;

create or replace function public.vehicle_doc_label(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type when 'INSPECTION' then 'ឆៀកឡាន' when 'ROAD_TAX' then 'ពន្ធផ្លូវ' else 'ធានារ៉ាប់រងយានយន្ត' end
$$;

/** Daily (08:15 Cambodia time): D-30 / D-15 / D-7 (remind_days), the day itself, and expired (day 1, then weekly). */
create or replace function public.run_vehicle_doc_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  d public.vehicle_documents;
  left_days integer;
  label text;
  new_id uuid;
  n integer := 0;
begin
  for d in
    select v.* from public.vehicle_documents v
    join public.workspaces w on w.id = v.workspace_id
    where w.type::text = 'PERSONAL'
  loop
    left_days := d.expires_on - today;
    continue when not (left_days = any (d.remind_days) or left_days = 0 or (left_days < 0 and (-left_days) % 7 = 1));
    label := public.vehicle_doc_label(d.doc_type);
    new_id := null;
    insert into public.notifications (workspace_id, vehicle_document_id, title, message, type, alert_key, scheduled_at)
    values (
      d.workspace_id, d.id,
      case
        when left_days < 0 then '🔴 ' || label || ' ផុតកំណត់ហើយ៖ ' || d.vehicle
        when left_days = 0 then '⚠️ ' || label || ' ផុតកំណត់ថ្ងៃនេះ៖ ' || d.vehicle
        else '🚗 ' || label || ' ជិតផុតកំណត់ (' || public.format_duration(left_days, 'remaining', 'km', today) || ')៖ ' || d.vehicle
      end,
      d.vehicle || ' · ' || label || coalesce(' (' || d.provider || ')', '') || ' · ផុតកំណត់ ' || to_char(d.expires_on, 'DD/MM/YYYY')
        || coalesce(' · ប្រហែល ' || public.format_money_text(d.cost, d.currency), '')
        || ' · សូមបន្តឱ្យទាន់ពេល កុំឱ្យជាប់ការផាកពិន័យ។',
      'DUE_DATE',
      'VDOC:' || d.expires_on::text || ':' || left_days::text,
      now()
    )
    on conflict (vehicle_document_id, alert_key) where vehicle_document_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_vehicle_doc_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'luychlat-vehicle-doc-alerts';
    perform cron.schedule('luychlat-vehicle-doc-alerts', '15 1 * * *', 'select public.run_vehicle_doc_alerts()');
  else
    raise warning 'pg_cron is not installed: vehicle document reminders will not run on a schedule';
  end if;
end $$;

select public.apply_security_gate();
