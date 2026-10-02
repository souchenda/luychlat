-- Diamonds (ពេជ្រ) in the jewelry section: Cambodian and GIA grading,
-- certificate, and the shop's buy-back deduction, from which the app works
-- out the liquid resale value used in net worth. Idempotent.

create table if not exists public.diamond_holdings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  form            text not null check (form in ('RING', 'NECKLACE', 'EARRINGS', 'BRACELET', 'LOOSE')),
  -- Size in លី = millimetres (diameter of a round stone), e.g. 5.4.
  size_li         numeric(5, 2) check (size_li is null or size_li between 0.5 and 50),
  carat           numeric(7, 3) check (carat is null or carat between 0.001 and 500),
  -- KH = Cambodian water scale (ទឹក 97–100), GIA = D…M
  color_scale     text check (color_scale in ('KH', 'GIA')),
  color           text check (color is null or color in ('97', '98', '99', '100', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M')),
  clarity         text check (clarity is null or clarity in ('FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1')),
  cert_type       text not null default 'NONE' check (cert_type in ('GIA', 'HRD', 'IGI', 'STORE', 'NONE')),
  cert_number     text check (cert_number is null or char_length(cert_number) <= 60),
  store           text check (store is null or char_length(store) <= 80),
  purchase_date   date,
  purchase_price  numeric(18, 2) not null check (purchase_price >= 0),
  currency        public.currency_code not null default 'USD',
  -- Shop buy-back: % taken off the purchase price when selling back for cash (and when trading in).
  buyback_pct     numeric(5, 2) not null default 15 check (buyback_pct between 0 and 100),
  tradein_pct     numeric(5, 2) check (tradein_pct is null or tradein_pct between 0 and 100),
  note            text check (note is null or char_length(note) <= 300),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check ((color is null) or (color_scale = 'KH' and color in ('97', '98', '99', '100')) or (color_scale = 'GIA' and color !~ '^[0-9]'))
);
create index if not exists diamond_holdings_workspace_idx on public.diamond_holdings (workspace_id);
alter table public.diamond_holdings enable row level security;

drop policy if exists diamond_holdings_select on public.diamond_holdings;
create policy diamond_holdings_select on public.diamond_holdings
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists diamond_holdings_insert on public.diamond_holdings;
create policy diamond_holdings_insert on public.diamond_holdings
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists diamond_holdings_update on public.diamond_holdings;
create policy diamond_holdings_update on public.diamond_holdings
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
drop policy if exists diamond_holdings_delete on public.diamond_holdings;
create policy diamond_holdings_delete on public.diamond_holdings
  for delete to authenticated using (public.can_write_workspace(workspace_id));

grant select, insert, delete on public.diamond_holdings to authenticated;
grant update (name, form, size_li, carat, color_scale, color, clarity, cert_type, cert_number, store, purchase_date, purchase_price, currency, buyback_pct, tradein_pct, note)
  on public.diamond_holdings to authenticated;

do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.reset_my_data()'::regprocedure);
  if position('diamond_holdings' in def) = 0 then
    def := replace(
      def,
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);',
      'delete from public.gold_holdings where workspace_id in (select id from reset_ws);
  delete from public.diamond_holdings where workspace_id in (select id from reset_ws);'
    );
    execute def;
  end if;
end $$;
