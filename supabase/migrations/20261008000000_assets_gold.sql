-- Assets: gold & platinum holdings (Cambodian weight units, daily market
-- rates set by admins) and physical assets (land, house, vehicles…). Idempotent.
--
-- Weight is stored in ហ៊ុន (hun), the smallest everyday unit:
--   1 តម្លឹង (damlung) = 10 ជី (chi) = 100 ហ៊ុន = 37.5 g;  1 ហ៊ុន = 0.375 g.

create table if not exists public.gold_holdings (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  -- GOLD_BAR = មាសគីឡូ (99.99%), GOLD_24K = មាសទឹក១០, GOLD_18K = មាសទឹក៨, PLATINUM = ប្លាទីន
  kind              text not null check (kind in ('GOLD_BAR', 'GOLD_24K', 'GOLD_18K', 'PLATINUM')),
  weight_hun        numeric(12, 2) not null check (weight_hun > 0 and weight_hun <= 1000000),
  purchase_date     date,
  purchase_price    numeric(18, 2) check (purchase_price is null or purchase_price >= 0),
  purchase_currency public.currency_code,
  note              text check (note is null or char_length(note) <= 300),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  check ((purchase_price is null) = (purchase_currency is null))
);
create index if not exists gold_holdings_workspace_idx on public.gold_holdings (workspace_id);
alter table public.gold_holdings enable row level security;

-- Same rules as the rest of a workspace: members read; owners/members write
-- (which also respects the plan's read-only business workspaces).
drop policy if exists gold_holdings_select on public.gold_holdings;
create policy gold_holdings_select on public.gold_holdings
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists gold_holdings_insert on public.gold_holdings;
create policy gold_holdings_insert on public.gold_holdings
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists gold_holdings_update on public.gold_holdings;
create policy gold_holdings_update on public.gold_holdings
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
drop policy if exists gold_holdings_delete on public.gold_holdings;
create policy gold_holdings_delete on public.gold_holdings
  for delete to authenticated using (public.can_write_workspace(workspace_id));

grant select, insert, delete on public.gold_holdings to authenticated;
grant update (name, kind, weight_hun, purchase_date, purchase_price, purchase_currency, note) on public.gold_holdings to authenticated;

-- ---------------------------------------------------------------------------
-- Market rates (app_settings "gold_rates"): USD per damlung for each kind,
-- e.g. {"GOLD_BAR": "2850", "GOLD_24K": "2800", "GOLD_18K": "2050", "PLATINUM": "1150"}.
-- Readable by every signed-in user (existing app_settings policy).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_gold_rates(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_value, '{}'::jsonb);
  k text;
begin
  perform public.require_admin();
  if jsonb_typeof(v) <> 'object' or length(v::text) > 500 then
    raise exception 'invalid rates' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v) loop
    if k not in ('GOLD_BAR', 'GOLD_24K', 'GOLD_18K', 'PLATINUM') then
      raise exception 'unknown kind %', k using errcode = '22023';
    end if;
    if v ->> k is not null and not ((v ->> k) ~ '^[0-9]+(\.[0-9]+)?$' and (v ->> k)::numeric between 1 and 1000000) then
      raise exception 'invalid rate for %', k using errcode = '22023';
    end if;
  end loop;
  insert into public.app_settings (key, value, updated_at) values ('gold_rates', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_gold_rates(jsonb) from public, anon;
grant execute on function public.admin_set_gold_rates(jsonb) to authenticated;

-- "Reset all data" also removes gold holdings (in place, keeping the rest of
-- the latest reset_my_data definition).
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.reset_my_data()'::regprocedure);
  if position('gold_holdings' in def) = 0 then
    def := replace(
      def,
      'delete from public.wallets_accounts where workspace_id in (select id from reset_ws);',
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);
  delete from public.wallets_accounts where workspace_id in (select id from reset_ws);'
    );
    execute def;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Real estate, vehicles, machinery and other physical assets: an estimated
-- market value, optionally linked to the bank loan that financed it (net
-- equity = value − what is still owed on that loan).
-- ---------------------------------------------------------------------------
create table if not exists public.physical_assets (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  kind            text not null check (kind in ('LAND', 'HOUSE', 'VEHICLE', 'MACHINERY', 'OTHER')),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  estimated_value numeric(18, 2) not null check (estimated_value >= 0),
  currency        public.currency_code not null,
  purchase_date   date,
  purchase_price  numeric(18, 2) check (purchase_price is null or purchase_price >= 0),
  debt_id         uuid,
  note            text check (note is null or char_length(note) <= 300),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  -- The loan must be in the same workspace; deleting it just removes the link.
  foreign key (debt_id, workspace_id) references public.debts (id, workspace_id) on delete set null (debt_id)
);
create index if not exists physical_assets_workspace_idx on public.physical_assets (workspace_id);
alter table public.physical_assets enable row level security;

drop policy if exists physical_assets_select on public.physical_assets;
create policy physical_assets_select on public.physical_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists physical_assets_insert on public.physical_assets;
create policy physical_assets_insert on public.physical_assets
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists physical_assets_update on public.physical_assets;
create policy physical_assets_update on public.physical_assets
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
drop policy if exists physical_assets_delete on public.physical_assets;
create policy physical_assets_delete on public.physical_assets
  for delete to authenticated using (public.can_write_workspace(workspace_id));

grant select, insert, delete on public.physical_assets to authenticated;
grant update (kind, name, estimated_value, currency, purchase_date, purchase_price, debt_id, note) on public.physical_assets to authenticated;

do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.reset_my_data()'::regprocedure);
  if position('physical_assets' in def) = 0 then
    def := replace(
      def,
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);',
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);
  delete from public.physical_assets where workspace_id in (select id from reset_ws);'
    );
    execute def;
  end if;
end $$;
