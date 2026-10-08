-- Business fixed assets: cold storage / freezers, store fixtures & POS, and the
-- value of stock on hand (STOCK — the owner's figure; it doesn't depreciate).
-- Processing machinery and delivery vehicles use MACHINERY / VEHICLE (named for
-- business in the app). Depreciation stays non-cash: it is computed in the app
-- (P&L line, business value), never posted to a wallet.

alter table public.physical_assets drop constraint if exists physical_assets_kind_check;
alter table public.physical_assets add constraint physical_assets_kind_check
  check (kind in ('LAND', 'HOUSE', 'VEHICLE', 'MACHINERY', 'ELECTRONICS', 'FURNITURE',
                  'COLD_STORAGE', 'FIXTURES', 'STOCK', 'OTHER'));
