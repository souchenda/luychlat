-- The Islamic places finder, pre-loaded like the ATM finder (founder, 19/10/2026): mosques, surau and halal food
-- across Cambodia from OpenStreetMap, refreshed weekly by the server (lib/server/islamic-places-sync.ts). They are
-- listed at once (approved), marked source = 'osm'; a community suggestion stays source = 'community' and waits
-- for an admin as before. OpenStreetMap's halal tag is never a certification: halal_certified stays the admin's.

alter table public.islamic_places add column if not exists osm_ref text;
alter table public.islamic_places add column if not exists source text not null default 'community';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'islamic_places_source_check') then
    alter table public.islamic_places add constraint islamic_places_source_check check (source in ('community', 'osm'));
  end if;
end $$;
create unique index if not exists islamic_places_osm_ref_key on public.islamic_places (osm_ref) where osm_ref is not null;

/**
 * The weekly refresh: upsert OpenStreetMap's places by reference and remove the ones it no longer has. A short
 * answer (fewer than 40 places — Overpass cut off) changes nothing. An admin's halal certification is kept.
 */
create or replace function public.bot_islamic_places_sync(p_key text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int := coalesce(jsonb_array_length(p_rows), 0);
  removed int := 0;
begin
  perform public.require_bot(p_key);
  if n < 40 then
    return jsonb_build_object('status', 'skipped', 'rows', n);
  end if;
  insert into public.islamic_places (osm_ref, source, kind, name, province, address, lat, lng, approved, created_by)
  select r.osm_ref, 'osm', r.kind, r.name, r.province, r.address, r.lat, r.lng, true, null
  from jsonb_to_recordset(p_rows) as r(osm_ref text, kind text, name text, province text, address text, lat double precision, lng double precision)
  where r.osm_ref ~ '^[nwr][0-9]{1,15}$' and r.kind in ('MOSQUE', 'SURAU', 'HALAL')
    and char_length(btrim(r.name)) between 1 and 120 and r.lat between 9.5 and 15 and r.lng between 102 and 108
  on conflict (osm_ref) where osm_ref is not null do update
    set kind = excluded.kind, name = excluded.name, province = excluded.province, address = excluded.address,
        lat = excluded.lat, lng = excluded.lng, approved = true;
  delete from public.islamic_places p
   where p.source = 'osm'
     and p.osm_ref not in (select r ->> 'osm_ref' from jsonb_array_elements(p_rows) r);
  get diagnostics removed = row_count;
  return jsonb_build_object('status', 'ok', 'rows', n, 'removed', removed);
end;
$$;
revoke all on function public.bot_islamic_places_sync(text, jsonb) from public, anon, authenticated;
