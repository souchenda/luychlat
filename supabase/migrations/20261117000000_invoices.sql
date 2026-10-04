-- Phase 4: Quick Invoice / Receipt with KHQR.
--   * invoices: numbered INV-YYYYMM-NNN per workspace (Cambodia month), items,
--     customer, status pending → paid / cancelled. "Paid" logs the income in a
--     wallet (the invoice's wallet, else the first one in its currency).
--   * FREE: 5 invoices a month per person; PRO / ULTRA: unlimited.
--   * profiles.khqr_payload: the text inside the user's KHQR (read from the
--     uploaded image in the browser), so the receipt image can draw a sharp
--     QR on the server — for the app and for the Telegram bot. The payload is
--     used as it is (no amount is added), so every bank app accepts it.
--   * Bot: /invoice and "គិតលុយ 12$ …" create one; ✅ / ❌ under the receipt.

alter table public.profiles add column if not exists khqr_payload text
  check (khqr_payload is null or (char_length(khqr_payload) between 20 and 512 and khqr_payload ~ '^000201'));

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  invoice_number   text not null check (char_length(invoice_number) <= 50),
  customer_name    text check (customer_name is null or char_length(customer_name) <= 255),
  customer_phone   text check (customer_phone is null or char_length(customer_phone) <= 50),
  total_amount     numeric(15, 2) not null check (total_amount > 0 and total_amount < 1e12),
  currency         public.currency_code not null default 'USD',
  -- [{"name": "កាហ្វេ", "qty": 2, "price": 2.5}] (qty and price optional)
  items            jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50),
  notes            text check (notes is null or char_length(notes) <= 500),
  status           text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  target_wallet_id uuid references public.wallets_accounts (id) on delete set null,
  transaction_id   uuid references public.transactions (id) on delete set null,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);
create index if not exists invoices_workspace_idx on public.invoices (workspace_id, created_at desc);
create index if not exists invoices_creator_month_idx on public.invoices (created_by, created_at);
alter table public.invoices enable row level security;

-- Read by workspace members; written only through the functions below (numbering, limits, wallet).
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated using (public.can_write_workspace(workspace_id));
revoke insert, update on public.invoices from anon, authenticated;
grant select, delete on public.invoices to authenticated;

-- Items cleaned up: names trimmed (1–80), qty > 0, price >= 0; anything else is dropped.
create or replace function public.clean_invoice_items(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'name', left(btrim(e ->> 'name'), 80),
           'qty', case when jsonb_typeof(e -> 'qty') = 'number' and (e ->> 'qty')::numeric > 0 and (e ->> 'qty')::numeric <= 1e6 then (e ->> 'qty')::numeric end,
           'price', case when jsonb_typeof(e -> 'price') = 'number' and (e ->> 'price')::numeric >= 0 and (e ->> 'price')::numeric < 1e12 then (e ->> 'price')::numeric end
         )) order by o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality as x (e, o)
  where jsonb_typeof(e) = 'object' and char_length(btrim(coalesce(e ->> 'name', ''))) between 1 and 80 and o <= 50;
$$;

-- Invoices this person made this Cambodia month (for the FREE limit).
create or replace function public.invoices_this_month(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.invoices
  where created_by = p_user_id
    and created_at >= (date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh');
$$;
revoke all on function public.invoices_this_month(uuid) from public, anon, authenticated;

-- Usage for the app: how many this month and the plan's limit (null = unlimited).
create or replace function public.my_invoice_quota()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', public.invoices_this_month((select auth.uid())),
    'limit', case when public.plan_code_of((select auth.uid())) = 'FREE' then 5 end
  );
$$;
revoke all on function public.my_invoice_quota() from public, anon;
grant execute on function public.my_invoice_quota() to authenticated;

-- New invoice. Without p_total, the total is the sum of qty × price.
create or replace function public.create_invoice(
  p_workspace_id uuid,
  p_total numeric,
  p_currency public.currency_code,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null,
  p_target_wallet_id uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  items jsonb := public.clean_invoice_items(p_items);
  total numeric := p_total;
  prefix text;
  seq integer;
  result public.invoices;
begin
  if uid is null or not public.can_write_workspace(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.plan_code_of(uid) = 'FREE' and public.invoices_this_month(uid) >= 5 then
    raise exception 'plan_limit:invoices' using errcode = 'P0001';
  end if;
  if total is null then
    select sum(coalesce((e ->> 'qty')::numeric, 1) * (e ->> 'price')::numeric) into total
    from jsonb_array_elements(items) e where e ? 'price';
  end if;
  total := round(total, case when p_currency = 'KHR' then 0 else 2 end);
  if total is null or total <= 0 or total >= 1e12 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_target_wallet_id is not null and not exists (
    select 1 from public.wallets_accounts w where w.id = p_target_wallet_id and w.workspace_id = p_workspace_id
  ) then
    raise exception 'invalid wallet' using errcode = '22023';
  end if;

  -- One number at a time per workspace.
  perform pg_advisory_xact_lock(hashtextextended('invoice:' || p_workspace_id::text, 0));
  prefix := 'INV-' || to_char(now() at time zone 'Asia/Phnom_Penh', 'YYYYMM') || '-';
  select coalesce(max(substr(invoice_number, char_length(prefix) + 1)::integer), 0) + 1 into seq
  from public.invoices
  where workspace_id = p_workspace_id and invoice_number like prefix || '%' and substr(invoice_number, char_length(prefix) + 1) ~ '^\d{1,6}$';

  insert into public.invoices (workspace_id, created_by, invoice_number, customer_name, customer_phone, total_amount, currency, items, notes, target_wallet_id)
  values (
    p_workspace_id, uid, prefix || lpad(seq::text, 3, '0'),
    left(nullif(btrim(coalesce(p_customer_name, '')), ''), 255),
    left(nullif(btrim(coalesce(p_customer_phone, '')), ''), 50),
    total, p_currency, items,
    left(nullif(btrim(coalesce(p_notes, '')), ''), 500),
    p_target_wallet_id
  )
  returning * into result;
  return result;
end;
$$;
revoke all on function public.create_invoice(uuid, numeric, public.currency_code, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.create_invoice(uuid, numeric, public.currency_code, text, text, jsonb, text, uuid) to authenticated;

-- Paid: logs the income in a wallet the caller may use (p_wallet_id, else the
-- invoice's wallet, else the first one in its currency, else any).
create or replace function public.mark_invoice_paid(p_invoice_id uuid, p_wallet_id uuid default null, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invoices;
  w public.wallets_accounts;
  rate numeric;
  category_id uuid;
  tx_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or not public.can_write_workspace(inv.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if inv.status = 'paid' then
    return jsonb_build_object('status', 'already', 'number', inv.invoice_number);
  end if;
  if inv.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'number', inv.invoice_number);
  end if;

  select x.* into w from public.wallets_accounts x
  where x.workspace_id = inv.workspace_id
    and x.archived_at is null
    and (x.visibility <> 'PERSONAL' or x.owner_id = uid)
    and (x.id = coalesce(p_wallet_id, inv.target_wallet_id) or (p_wallet_id is null))
  order by (x.id = coalesce(p_wallet_id, inv.target_wallet_id)) desc nulls last, (x.currency = inv.currency) desc, x.created_at
  limit 1;
  if p_wallet_id is not null and w.id is null then
    raise exception 'invalid wallet' using errcode = '22023';
  end if;

  if w.id is not null then
    select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = inv.workspace_id;
    category_id := public.ensure_preset_category(inv.workspace_id, 'invoice_income', 'INCOME', 'receipt', '#10b981', 'ចំណូលពីវិក្កយបត្រ');
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, exchange_rate, created_by)
    values (
      inv.workspace_id, w.id, category_id, inv.total_amount, inv.currency, 'INCOME',
      coalesce(p_date::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours', now()),
      left(inv.invoice_number || coalesce(' · ' || inv.customer_name, ''), 500),
      case when w.currency <> inv.currency then rate end, uid
    )
    returning id into tx_id;
  end if;

  update public.invoices
  set status = 'paid', paid_at = now(), transaction_id = tx_id, target_wallet_id = coalesce(w.id, target_wallet_id)
  where id = inv.id;
  return jsonb_build_object('status', 'paid', 'number', inv.invoice_number, 'logged', tx_id is not null, 'wallet', w.name,
                            'amount', inv.total_amount, 'currency', inv.currency);
end;
$$;
revoke all on function public.mark_invoice_paid(uuid, uuid, date) from public, anon;
grant execute on function public.mark_invoice_paid(uuid, uuid, date) to authenticated;

-- Cancel a pending invoice.
create or replace function public.cancel_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or not public.can_write_workspace(inv.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('status', inv.status, 'number', inv.invoice_number);
  end if;
  update public.invoices set status = 'cancelled' where id = inv.id;
  return jsonb_build_object('status', 'cancelled_now', 'number', inv.invoice_number);
end;
$$;
revoke all on function public.cancel_invoice(uuid) from public, anon;
grant execute on function public.cancel_invoice(uuid) to authenticated;

-- Back to pending (a mistake): a paid invoice's income entry is removed.
create or replace function public.reopen_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null or not public.can_write_workspace(inv.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.invoices set status = 'pending', paid_at = null, transaction_id = null where id = inv.id;
  if inv.transaction_id is not null then
    delete from public.transactions where id = inv.transaction_id;
  end if;
end;
$$;
revoke all on function public.reopen_invoice(uuid) from public, anon;
grant execute on function public.reopen_invoice(uuid) to authenticated;

-- Everything the receipt image needs: the invoice, who it is from and the
-- creator's KHQR text. Members of the invoice's workspace only.
create or replace function public.invoice_receipt(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  ws public.workspaces;
  p public.profiles;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if inv.id is null or not public.is_workspace_member(inv.workspace_id) then
    return null;
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;
  select * into p from public.profiles where id = inv.created_by;
  return jsonb_build_object(
    'invoice', to_jsonb(inv),
    'merchant', case when ws.type = 'BUSINESS' then ws.name else coalesce(nullif(btrim(p.display_name), ''), ws.name) end,
    'merchant_phone', case when ws.type = 'BUSINESS' then ws.business_phone end,
    'khqr', p.khqr_payload
  );
end;
$$;
revoke all on function public.invoice_receipt(uuid) from public, anon;
grant execute on function public.invoice_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Telegram bot
-- ---------------------------------------------------------------------------
-- /invoice from a linked chat, into the chat's workspace. Returns the receipt
-- data, or a status: not_linked / not_writable / limit / invalid.
create or replace function public.bot_create_invoice(
  p_key text, p_chat_id bigint, p_total numeric, p_currency text,
  p_customer text default null, p_items jsonb default '[]'::jsonb, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  inv public.invoices;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then
    return jsonb_build_object('status', 'not_writable');
  end if;
  if p_currency not in ('USD', 'KHR') then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    inv := public.create_invoice(link.ws, p_total, p_currency::public.currency_code, p_customer, null, p_items, p_notes, null);
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('status', 'limit');
    when sqlstate '22023' then
      return jsonb_build_object('status', 'invalid');
  end;
  return jsonb_build_object('status', 'ok') || public.invoice_receipt(inv.id);
end;
$$;
revoke all on function public.bot_create_invoice(text, bigint, numeric, text, text, jsonb, text) from public;
grant execute on function public.bot_create_invoice(text, bigint, numeric, text, text, jsonb, text) to anon, authenticated;

-- ✅ / ❌ under a receipt in Telegram. Returns the outcome and the receipt data (to redraw it).
create or replace function public.bot_invoice_action(p_key text, p_chat_id bigint, p_invoice_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  inv public.invoices;
  outcome jsonb;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into inv from public.invoices where id = p_invoice_id;
  if inv.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(inv.workspace_id) then
    return jsonb_build_object('status', 'not_writable');
  end if;
  if p_action = 'paid' then
    outcome := public.mark_invoice_paid(inv.id, null, null);
  elsif p_action = 'cancel' then
    outcome := public.cancel_invoice(inv.id);
  else
    raise exception 'invalid action' using errcode = '22023';
  end if;
  return outcome || jsonb_build_object('receipt', public.invoice_receipt(inv.id));
end;
$$;
revoke all on function public.bot_invoice_action(text, bigint, uuid, text) from public;
grant execute on function public.bot_invoice_action(text, bigint, uuid, text) to anon, authenticated;

select public.apply_security_gate();
