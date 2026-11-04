-- Order-ahead «កម្មង់ទុកមុន» — phase 1 (founder, 4/11/2026 — docs/order-ahead.md). A BUSINESS workspace whose owner is on
-- ULTRA (and, while it is tested, has the order_ahead feature) opens a public menu at /s/<slug>; customers order with a
-- name, a phone and a pickup time, and pay ahead by the shop's KHQR with the amount. Customers never touch these tables:
-- the server's routes call the key-checked functions below (require_bot), rate-limited. Prices always come from the menu,
-- never from the customer. Additive only.

create table if not exists public.order_shops (
  workspace_id  uuid primary key references public.workspaces (id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  enabled       boolean not null default false,
  khqr_code_id  uuid references public.workspace_khqr_codes (id) on delete set null,
  lead_minutes  integer not null default 15 check (lead_minutes between 5 and 240),
  note          text check (note is null or char_length(note) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.order_shops enable row level security;
revoke all on public.order_shops from anon, authenticated;
grant select, insert, update (slug, enabled, khqr_code_id, lead_minutes, note, updated_at) on public.order_shops to authenticated;
drop policy if exists order_shops_select on public.order_shops;
create policy order_shops_select on public.order_shops for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists order_shops_insert on public.order_shops;
create policy order_shops_insert on public.order_shops for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists order_shops_update on public.order_shops;
create policy order_shops_update on public.order_shops for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  description  text check (description is null or char_length(description) <= 200),
  price        numeric(18, 2) not null check (price > 0),
  currency     public.currency_code not null,
  photo_path   text check (photo_path is null or char_length(photo_path) <= 200),
  -- [{ "name": "ស្ករ", "choices": ["0%", "50%", "100%"] }] — at most 5 options of at most 6 choices.
  options      jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 5),
  available    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists order_items_ws_idx on public.order_items (workspace_id, sort_order);
alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items for all to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));

create table if not exists public.customer_orders (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  token          text not null unique check (token ~ '^[0-9a-f]{32}$'),
  code           text not null,
  items          jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  total          numeric(18, 2) not null check (total > 0),
  currency       public.currency_code not null,
  customer_name  text not null check (char_length(btrim(customer_name)) between 1 and 60),
  customer_phone text not null check (customer_phone ~ '^[0-9+ ]{8,16}$'),
  pickup_at      timestamptz not null,
  note           text check (note is null or char_length(note) <= 200),
  status         text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'READY', 'PICKED_UP', 'CANCELLED')),
  paid_via       text check (paid_via in ('AUTO', 'SLIP', 'SHOP')),
  paid_at        timestamptz,
  slip_ref       text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists customer_orders_ws_idx on public.customer_orders (workspace_id, created_at desc);
alter table public.customer_orders enable row level security;
revoke all on public.customer_orders from anon, authenticated;
grant select on public.customer_orders to authenticated;
drop policy if exists customer_orders_select on public.customer_orders;
create policy customer_orders_select on public.customer_orders for select to authenticated using (public.is_workspace_member(workspace_id));

-- The shop is open to customers: enabled, a BUSINESS workspace, its owner on ULTRA with the feature.
create or replace function public.order_shop_open(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.order_shops s
    join public.workspaces w on w.id = s.workspace_id
    where s.workspace_id = p_workspace_id and s.enabled and w.type = 'BUSINESS'
      and public.bot_tier(w.user_id) = 'ULTRA' and public.feature_allowed_for('order_ahead', w.user_id)
  );
$$;
revoke all on function public.order_shop_open(uuid) from public, anon, authenticated;

-- The public menu (the server's /api/order/<slug>).
create or replace function public.order_public_menu(p_key text, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.order_shops;
begin
  perform public.require_bot(p_key);
  select * into s from public.order_shops where slug = lower(btrim(p_slug));
  if s.workspace_id is null or not public.order_shop_open(s.workspace_id) then
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object(
    'status', 'open',
    'shop', (select jsonb_build_object('name', w.name, 'logo_path', w.logo_path) from public.workspaces w where w.id = s.workspace_id),
    'lead_minutes', s.lead_minutes,
    'note', s.note,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'description', i.description, 'price', i.price, 'currency', i.currency,
        'photo_path', i.photo_path, 'options', i.options) order by i.sort_order, i.created_at)
      from public.order_items i where i.workspace_id = s.workspace_id and i.available
    ), '[]'::jsonb)
  );
end;
$$;

-- A new order. p_items: [{ "id": <item>, "qty": 1-20, "choices": { "<option>": "<choice>" } }]. Prices from the menu;
-- one currency per order; a choice must be one the item offers; the pickup no sooner than the shop's lead time.
create or replace function public.order_create(p_key text, p_slug text, p_items jsonb, p_name text, p_phone text, p_pickup timestamptz, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.order_shops;
  line jsonb;
  it public.order_items;
  qty int;
  lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_currency public.currency_code;
  v_choices jsonb;
  v_opt jsonb;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_code text;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+ ]', '', 'g');
begin
  perform public.require_bot(p_key);
  select * into s from public.order_shops where slug = lower(btrim(p_slug));
  if s.workspace_id is null or not public.order_shop_open(s.workspace_id) then
    return jsonb_build_object('status', 'closed');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    return jsonb_build_object('status', 'invalid', 'reason', 'items');
  end if;
  if p_pickup is null or p_pickup < now() + make_interval(mins => s.lead_minutes - 1) or p_pickup > now() + interval '7 days' then
    return jsonb_build_object('status', 'invalid', 'reason', 'pickup');
  end if;
  for line in select value from jsonb_array_elements(p_items) loop
    select * into it from public.order_items where id = (line ->> 'id')::uuid and workspace_id = s.workspace_id and available;
    if it.id is null then
      return jsonb_build_object('status', 'invalid', 'reason', 'item');
    end if;
    qty := coalesce((line ->> 'qty')::int, 1);
    if qty not between 1 and 20 then
      return jsonb_build_object('status', 'invalid', 'reason', 'qty');
    end if;
    if v_currency is null then v_currency := it.currency;
    elsif v_currency <> it.currency then
      return jsonb_build_object('status', 'invalid', 'reason', 'currency');
    end if;
    -- Only the item's own options and choices are kept.
    v_choices := '{}'::jsonb;
    for v_opt in select value from jsonb_array_elements(it.options) loop
      if (line -> 'choices' ->> (v_opt ->> 'name')) is not null and (v_opt -> 'choices') ? (line -> 'choices' ->> (v_opt ->> 'name')) then
        v_choices := v_choices || jsonb_build_object(v_opt ->> 'name', line -> 'choices' ->> (v_opt ->> 'name'));
      end if;
    end loop;
    lines := lines || jsonb_build_array(jsonb_build_object('id', it.id, 'name', it.name, 'price', it.price, 'qty', qty, 'choices', v_choices));
    v_total := v_total + it.price * qty;
  end loop;
  -- A short code for the counter: A-001 … per shop and Cambodian day.
  select 'A-' || lpad((count(*) + 1)::text, 3, '0') into v_code from public.customer_orders
  where workspace_id = s.workspace_id and created_at >= date_trunc('day', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  insert into public.customer_orders (workspace_id, token, code, items, total, currency, customer_name, customer_phone, pickup_at, note)
  values (s.workspace_id, v_token, v_code, lines, v_total, v_currency, left(btrim(p_name), 60), btrim(v_phone), p_pickup, nullif(left(btrim(coalesce(p_note, '')), 200), ''));
  return jsonb_build_object('status', 'ok', 'token', v_token, 'code', v_code, 'total', v_total, 'currency', v_currency, 'workspace_id', s.workspace_id);
end;
$$;

-- What the customer's order page shows (by its secret token): never another order, never the shop's books.
create or replace function public.order_public_status(p_key text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.customer_orders;
begin
  perform public.require_bot(p_key);
  select * into o from public.customer_orders where token = p_token;
  if o.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'order', jsonb_build_object('code', o.code, 'items', o.items, 'total', o.total, 'currency', o.currency, 'pickup_at', o.pickup_at,
      'state', o.status, 'paid_via', o.paid_via, 'customer_name', o.customer_name, 'created_at', o.created_at),
    'shop', (select jsonb_build_object('name', w.name, 'slug', s.slug) from public.workspaces w join public.order_shops s on s.workspace_id = w.id where w.id = o.workspace_id),
    -- The shop's chosen KHQR (or its default) in the order's currency; the server adds the amount (lib/khqr.ts).
    'khqr', (
      select k.khqr_payload from public.workspace_khqr_codes k
      left join public.order_shops s on s.workspace_id = o.workspace_id
      where k.workspace_id = o.workspace_id and k.currency = o.currency
      order by (k.id = s.khqr_code_id) desc, k.is_default desc, k.created_at
      limit 1
    )
  );
end;
$$;

-- The shop moves an order along (the board in the app): PENDING_PAYMENT → PAID (the shop saw the money) → ACCEPTED →
-- READY → PICKED_UP; CANCELLED from any step before PICKED_UP. A member who can write to the workspace.
create or replace function public.order_set_status(p_order uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.customer_orders;
  allowed boolean;
begin
  select * into o from public.customer_orders where id = p_order for update;
  if o.id is null or not public.can_write_workspace(o.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  allowed := case p_status
    when 'PAID' then o.status = 'PENDING_PAYMENT'
    when 'ACCEPTED' then o.status = 'PAID'
    when 'READY' then o.status in ('PAID', 'ACCEPTED')
    when 'PICKED_UP' then o.status = 'READY'
    when 'CANCELLED' then o.status not in ('PICKED_UP', 'CANCELLED')
    else false end;
  if not allowed then
    return jsonb_build_object('status', 'refused', 'from', o.status);
  end if;
  update public.customer_orders
  set status = p_status, updated_at = now(),
      paid_via = case when p_status = 'PAID' then 'SHOP' else paid_via end,
      paid_at = case when p_status = 'PAID' then now() else paid_at end
  where id = o.id;
  return jsonb_build_object('status', 'ok', 'state', p_status, 'token', o.token, 'code', o.code);
end;
$$;

revoke all on function public.order_public_menu(text, text) from public;
revoke all on function public.order_create(text, text, jsonb, text, text, timestamptz, text) from public;
revoke all on function public.order_public_status(text, text) from public;
revoke all on function public.order_set_status(uuid, text) from public, anon;
grant execute on function public.order_public_menu(text, text) to anon, authenticated;
grant execute on function public.order_create(text, text, jsonb, text, text, timestamptz, text) to anon, authenticated;
grant execute on function public.order_public_status(text, text) to anon, authenticated;
grant execute on function public.order_set_status(uuid, text) to authenticated;

insert into public.feature_flags (key, status) values ('order_ahead', 'ADMIN_ONLY') on conflict (key) do nothing;

select public.apply_security_gate();
