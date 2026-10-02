-- ===========================================================================
-- Islamic Finance tools (optional, off by default).
--
-- Settings live in their own table, readable only by the user: whether
-- someone uses these tools is religious information, so it is NOT stored on
-- profiles (family members can read each other's profiles). The flag syncs
-- across the user's devices.
--
-- Turning the tools on adds five categories to the user's own workspaces:
-- Zakat, Sadaqah, Waqf (spending), Bank interest / Riba (income kept out of
-- totals) and Riba purification (its donation, also out of totals). Turning
-- them off keeps all data; the app just hides the tools again.
-- Idempotent: safe to re-run.
-- ===========================================================================

create table if not exists public.islamic_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  enabled         boolean not null default false,
  nisab_basis     text not null default 'GOLD' check (nisab_basis in ('GOLD', 'SILVER')),
  -- Price per gram in USD; null = use the admin default.
  gold_price      numeric(12, 4) check (gold_price is null or gold_price > 0),
  silver_price    numeric(12, 4) check (silver_price is null or silver_price > 0),
  -- Gold the user holds as savings (grams), counted as zakatable wealth.
  gold_grams      numeric(12, 3) not null default 0 check (gold_grams >= 0),
  -- Start of the current lunar year (hawl) for Zakat; due 354 days later.
  hawl_start      date,
  include_receivables boolean not null default false,
  include_business    boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table public.islamic_settings enable row level security;
drop policy if exists islamic_settings_own on public.islamic_settings;
create policy islamic_settings_own on public.islamic_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Turns the tools on/off for the caller; on also adds the categories to the
-- workspaces the caller owns (Personal, Business, their Family).
create or replace function public.set_islamic_tools(p_enabled boolean)
returns public.islamic_settings
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws record;
  result public.islamic_settings;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.islamic_settings (user_id, enabled, updated_at)
  values (uid, coalesce(p_enabled, false), now())
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now()
  returning * into result;

  if result.enabled then
    for ws in select id from public.workspaces where user_id = uid loop
      perform public.ensure_preset_category(ws.id, 'zakat', 'EXPENSE', 'hand-heart', '#059669', 'ហ្សាកាត់');
      perform public.ensure_preset_category(ws.id, 'sadaqah', 'EXPENSE', 'hand-heart', '#0d9488', 'ទាន សាដាកះ');
      perform public.ensure_preset_category(ws.id, 'waqf', 'EXPENSE', 'landmark', '#0891b2', 'វ៉ាក់ហ្វ');
      perform public.ensure_preset_category(ws.id, 'riba_purification', 'EXPENSE', 'scale', '#64748b', 'សម្អាតការប្រាក់');
      perform public.ensure_preset_category(ws.id, 'bank_interest', 'INCOME', 'landmark', '#64748b', 'ការប្រាក់ធនាគារ');
    end loop;
  end if;
  return result;
end;
$$;
revoke all on function public.set_islamic_tools(boolean) from public, anon;
grant execute on function public.set_islamic_tools(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin defaults (app_settings "islamic_defaults"): gold / silver price per
-- gram in USD, and a ±2-day Hijri offset to follow the local moon-sighting
-- announcement (Ramadan / Eid dates).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_islamic_defaults(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_value, '{}'::jsonb);
begin
  perform public.require_admin();
  if jsonb_typeof(v) <> 'object' or length(v::text) > 1000 then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  if (v ? 'gold_price' and v ->> 'gold_price' is not null and not ((v ->> 'gold_price') ~ '^[0-9]+(\.[0-9]+)?$' and (v ->> 'gold_price')::numeric between 0.01 and 100000))
     or (v ? 'silver_price' and v ->> 'silver_price' is not null and not ((v ->> 'silver_price') ~ '^[0-9]+(\.[0-9]+)?$' and (v ->> 'silver_price')::numeric between 0.001 and 10000))
     or (v ? 'hijri_offset' and v ->> 'hijri_offset' is not null and not ((v ->> 'hijri_offset') ~ '^-?[0-2]$')) then
    raise exception 'invalid value' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('islamic_defaults', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_islamic_defaults(jsonb) from public, anon;
grant execute on function public.admin_set_islamic_defaults(jsonb) to authenticated;
