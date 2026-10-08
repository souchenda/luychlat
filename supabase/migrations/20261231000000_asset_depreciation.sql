-- Fixed assets: straight-line depreciation (រំលស់).
-- A phone, laptop, vehicle, machine or furniture bought for a cost loses value
-- evenly over its useful life: book value = cost − cost / life × months used,
-- never below 0. With a useful life set (and a purchase date and cost), the app
-- shows and counts that book value (in net worth too) instead of the estimate.
-- Without one, nothing changes: the owner's estimate stays the value (land, a house).

alter table public.physical_assets
  add column if not exists useful_life_months integer
    check (useful_life_months is null or useful_life_months between 1 and 600);

-- A depreciating asset needs what the schedule is computed from.
alter table public.physical_assets drop constraint if exists physical_assets_depreciation_check;
alter table public.physical_assets add constraint physical_assets_depreciation_check
  check (useful_life_months is null or (purchase_price is not null and purchase_date is not null));

alter table public.physical_assets drop constraint if exists physical_assets_kind_check;
alter table public.physical_assets add constraint physical_assets_kind_check
  check (kind in ('LAND', 'HOUSE', 'VEHICLE', 'MACHINERY', 'ELECTRONICS', 'FURNITURE', 'OTHER'));

grant update (useful_life_months) on public.physical_assets to authenticated;
