-- Business fixed asset register (CIFRS for SMEs): standard categories, salvage
-- value, serial / reference, and status. Same table as personal assets
-- (physical_assets), scoped to the business by workspace_id under the existing RLS.
--
--   kind (business): BUILDINGS_LEASEHOLD, MACHINERY_EQUIPMENT, VEHICLES,
--                    FURNITURE_FIXTURES, IT_ELECTRONICS, OTHER — and STOCK
--                    (stock on hand: valued, never depreciated).
--   status: ACTIVE or DISPOSED (with its date). FULLY_DEPRECIATED is derived in the
--           app from the dates, so it can never go stale.
-- The industry-specific kinds of 20270102000000 (COLD_STORAGE, FIXTURES) are dropped;
-- no rows used them.

alter table public.physical_assets
  add column if not exists salvage_value numeric(18, 2) not null default 0,
  add column if not exists serial_or_reference text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists disposed_on date;

alter table public.physical_assets drop constraint if exists physical_assets_salvage_check;
alter table public.physical_assets add constraint physical_assets_salvage_check
  check (salvage_value >= 0 and (purchase_price is null or salvage_value <= purchase_price));
alter table public.physical_assets drop constraint if exists physical_assets_serial_check;
alter table public.physical_assets add constraint physical_assets_serial_check
  check (serial_or_reference is null or char_length(btrim(serial_or_reference)) between 1 and 60);
alter table public.physical_assets drop constraint if exists physical_assets_status_check;
alter table public.physical_assets add constraint physical_assets_status_check
  check (status in ('ACTIVE', 'DISPOSED') and ((status = 'DISPOSED') = (disposed_on is not null)));

update public.physical_assets set kind = 'MACHINERY_EQUIPMENT' where kind = 'COLD_STORAGE';
update public.physical_assets set kind = 'FURNITURE_FIXTURES' where kind = 'FIXTURES';
alter table public.physical_assets drop constraint if exists physical_assets_kind_check;
alter table public.physical_assets add constraint physical_assets_kind_check
  check (kind in (
    -- personal
    'LAND', 'HOUSE', 'VEHICLE', 'MACHINERY', 'ELECTRONICS', 'FURNITURE', 'OTHER',
    -- business register
    'BUILDINGS_LEASEHOLD', 'MACHINERY_EQUIPMENT', 'VEHICLES', 'FURNITURE_FIXTURES', 'IT_ELECTRONICS', 'STOCK'
  ));

grant update (salvage_value, serial_or_reference, status, disposed_on) on public.physical_assets to authenticated;
