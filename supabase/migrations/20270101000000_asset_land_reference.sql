-- Land & houses: where the plot is and how big it is, for the area price reference
-- (a $/m² range per Khan in Phnom Penh from the CVEA report; src/lib/land-prices.ts).
-- Advisory only: the owner's estimated value stays what counts in net worth.
--   location: a Phnom Penh Khan key ('toul_kork', …) or 'province'; null = not given.

alter table public.physical_assets
  add column if not exists location text check (location is null or location ~ '^[a-z0-9_]{2,40}$'),
  add column if not exists area_m2 numeric(14, 2) check (area_m2 is null or (area_m2 > 0 and area_m2 < 100000000));

grant update (location, area_m2) on public.physical_assets to authenticated;
