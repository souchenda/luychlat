-- Stocks (CSX and international) and crypto holdings, and daily market
-- prices set by admins. Idempotent.
--
-- A holding stores the quantity, the average buy price per unit and, when the
-- admin hasn't priced its symbol, the user's own latest price.

create table if not exists public.investment_holdings (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  -- STOCK_CSX (Cambodia Securities Exchange), STOCK_INTL (e.g. AAPL), CRYPTO (e.g. BTC)
  market           text not null check (market in ('STOCK_CSX', 'STOCK_INTL', 'CRYPTO')),
  symbol           text not null check (symbol ~ '^[A-Z0-9.\-]{1,15}$'),
  name             text check (name is null or char_length(name) <= 80),
  quantity         numeric(28, 8) not null check (quantity > 0),
  avg_cost         numeric(24, 8) not null check (avg_cost >= 0),
  currency         public.currency_code not null,
  current_price    numeric(24, 8) check (current_price is null or current_price >= 0),
  price_updated_at timestamptz,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- Crypto is quoted in US dollars.
  check (market <> 'CRYPTO' or currency = 'USD')
);
create index if not exists investment_holdings_workspace_idx on public.investment_holdings (workspace_id);
alter table public.investment_holdings enable row level security;

drop policy if exists investment_holdings_select on public.investment_holdings;
create policy investment_holdings_select on public.investment_holdings
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists investment_holdings_insert on public.investment_holdings;
create policy investment_holdings_insert on public.investment_holdings
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists investment_holdings_update on public.investment_holdings;
create policy investment_holdings_update on public.investment_holdings
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
drop policy if exists investment_holdings_delete on public.investment_holdings;
create policy investment_holdings_delete on public.investment_holdings
  for delete to authenticated using (public.can_write_workspace(workspace_id));

grant select, insert, delete on public.investment_holdings to authenticated;
grant update (market, symbol, name, quantity, avg_cost, currency, current_price, price_updated_at) on public.investment_holdings to authenticated;

-- ---------------------------------------------------------------------------
-- Market prices (app_settings "market_prices"), keyed "<market>:<symbol>":
--   {"STOCK_CSX:ABC": "7020", "CRYPTO:BTC": "65000", "STOCK_INTL:AAPL": "190.5"}
-- CSX prices are in riel, the others in US dollars. Admin prices win over a
-- user's own price for the same symbol.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_market_prices(p_value jsonb)
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
  if jsonb_typeof(v) <> 'object' or length(v::text) > 20000 then
    raise exception 'invalid prices' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v) loop
    if k !~ '^(STOCK_CSX|STOCK_INTL|CRYPTO):[A-Z0-9.\-]{1,15}$' then
      raise exception 'invalid symbol %', k using errcode = '22023';
    end if;
    if v ->> k is null or not ((v ->> k) ~ '^[0-9]+(\.[0-9]+)?$' and (v ->> k)::numeric between 0 and 1000000000) then
      raise exception 'invalid price for %', k using errcode = '22023';
    end if;
  end loop;
  insert into public.app_settings (key, value, updated_at) values ('market_prices', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_market_prices(jsonb) from public, anon;
grant execute on function public.admin_set_market_prices(jsonb) to authenticated;

-- "Reset all data" also removes investment holdings.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.reset_my_data()'::regprocedure);
  if position('investment_holdings' in def) = 0 then
    def := replace(
      def,
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);',
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);
  delete from public.investment_holdings where workspace_id in (select id from reset_ws);'
    );
    execute def;
  end if;
end $$;
