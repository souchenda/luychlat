-- Security hardening (audit, October 2026). Re-runnable.
--
-- 1. Balances change only through the ledger: the balance trigger runs as the
--    table owner, clients can no longer UPDATE wallets_accounts.balance, and
--    the balance helper can't be called directly.
-- 2. Column-level UPDATE rights: ownership/derived columns (workspace_id,
--    created_by, status, type of a workspace, ...) are read-only for clients.
-- 3. Notifications are written by the database only (no forged alerts).
-- 4. Guest-data import is for workspace owners only.
-- 5. A record's receipt photo must be the caller's own upload.
-- 6. A debt's loan link must point at that debt's own ledger row.
-- 7. Anonymous visitors get no table or function access at all.

-- 1 -------------------------------------------------------------------------
create or replace function public.on_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.adjust_wallet_balances(old, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.adjust_wallet_balances(new, 1);
  end if;
  return null;
end;
$$;

revoke all on function public.adjust_wallet_balances(public.transactions, integer) from public, anon, authenticated;

-- 2 -------------------------------------------------------------------------
revoke update on public.wallets_accounts from anon, authenticated;
grant update (name, icon, color, sort_order, archived_at, visibility, currency) on public.wallets_accounts to authenticated;

revoke update on public.workspaces from anon, authenticated;
grant update (name, currency_default) on public.workspaces to authenticated;

revoke update on public.transactions from anon, authenticated;
grant update (wallet_id, to_wallet_id, category_id, amount, to_amount, currency, type, exchange_rate, note, receipt_url, transaction_date, debt_id)
  on public.transactions to authenticated;

-- paid_amount stays updatable only because triggers "touch" it; its value is
-- always recomputed from the repayments (debts_derive), and so is status.
revoke update on public.debts from anon, authenticated;
grant update (type, party_name, contact_phone, total_amount, currency, interest_rate, interest_period, start_date, due_date, note, paid_amount, disbursement_transaction_id)
  on public.debts to authenticated;

revoke update on public.categories from anon, authenticated;
grant update (name, type, icon, color, preset_key) on public.categories to authenticated;

revoke update on public.budgets from anon, authenticated;
grant update (workspace_id, category_id, amount, currency) on public.budgets to authenticated;

revoke update on public.workspace_members from anon, authenticated;
grant update (role) on public.workspace_members to authenticated;

-- id is listed because the app saves the name with an upsert (the policy keeps it = auth.uid()).
revoke update on public.profiles from anon, authenticated;
grant update (id, display_name, updated_at) on public.profiles to authenticated;

-- 3 -------------------------------------------------------------------------
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_delete on public.notifications;
revoke insert, delete on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

-- 4 -------------------------------------------------------------------------
create or replace function public.import_guest_data(p_workspace_id uuid, p_data jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c jsonb;
  w jsonb;
  t jsonb;
  d jsonb;
  r jsonb;
  b jsonb;
  mapped uuid;
  added integer;
  next_sort integer;
  n_categories integer := 0;
  n_wallets integer := 0;
  n_transactions integer := 0;
  n_debts integer := 0;
  n_repayments integer := 0;
  n_budgets integer := 0;
begin
  -- Owners only: in a shared family workspace an import would add records
  -- without alerting the other members.
  if not public.owns_workspace(p_workspace_id) then
    raise exception 'no write access to this workspace' using errcode = '42501';
  end if;
  perform set_config('luysmart.import', 'on', true);

  create temporary table if not exists import_category_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  truncate import_category_map;

  -- Categories: reuse the account's preset or same-named category, else add it.
  for c in select value from jsonb_array_elements(coalesce(p_data -> 'categories', '[]'::jsonb)) loop
    mapped := null;
    if c ->> 'preset_key' is not null then
      select id into mapped from public.categories
      where workspace_id = p_workspace_id and preset_key = c ->> 'preset_key' limit 1;
    end if;
    if mapped is null then
      select id into mapped from public.categories
      where workspace_id = p_workspace_id and name = c ->> 'name' and type::text = c ->> 'type' limit 1;
    end if;
    if mapped is null then
      insert into public.categories (workspace_id, name, type, icon, color, preset_key)
      values (p_workspace_id, c ->> 'name', (c ->> 'type')::public.category_type, c ->> 'icon', c ->> 'color', c ->> 'preset_key')
      returning id into mapped;
      n_categories := n_categories + 1;
    end if;
    insert into import_category_map values ((c ->> 'id')::uuid, mapped) on conflict do nothing;
  end loop;

  -- Wallets after the account's own ones, starting from their opening balance.
  select coalesce(max(sort_order) + 1, 0) into next_sort from public.wallets_accounts where workspace_id = p_workspace_id;
  for w in select value from jsonb_array_elements(coalesce(p_data -> 'wallets', '[]'::jsonb)) loop
    insert into public.wallets_accounts (id, workspace_id, name, balance, currency, icon, color, sort_order, archived_at, visibility, created_at)
    values (
      (w ->> 'id')::uuid, p_workspace_id, w ->> 'name', (w ->> 'opening_balance')::numeric,
      (w ->> 'currency')::public.currency_code, w ->> 'icon', w ->> 'color',
      next_sort + coalesce((w ->> 'sort_order')::integer, 0), (w ->> 'archived_at')::timestamptz,
      coalesce(w ->> 'visibility', 'SHARED')::public.wallet_visibility, coalesce((w ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
    get diagnostics added = row_count;
    n_wallets := n_wallets + added;
  end loop;

  -- Debts before the ledger (ledger rows point at them).
  for d in select value from jsonb_array_elements(coalesce(p_data -> 'debts', '[]'::jsonb)) loop
    insert into public.debts (
      id, workspace_id, type, party_name, contact_phone, total_amount, currency,
      interest_rate, interest_period, start_date, due_date, note, created_at
    ) values (
      (d ->> 'id')::uuid, p_workspace_id, (d ->> 'type')::public.debt_type, d ->> 'party_name', d ->> 'contact_phone',
      (d ->> 'total_amount')::numeric, (d ->> 'currency')::public.currency_code,
      coalesce((d ->> 'interest_rate')::numeric, 0), coalesce(d ->> 'interest_period', 'YEAR')::public.interest_period,
      coalesce((d ->> 'start_date')::date, current_date), (d ->> 'due_date')::date, d ->> 'note',
      coalesce((d ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
    get diagnostics added = row_count;
    n_debts := n_debts + added;
  end loop;

  -- Ledger, already sorted by creation time by the app.
  for t in select value from jsonb_array_elements(coalesce(p_data -> 'transactions', '[]'::jsonb)) loop
    insert into public.transactions (
      id, workspace_id, wallet_id, to_wallet_id, category_id, amount, to_amount, currency, type,
      exchange_rate, note, receipt_url, transaction_date, created_at, debt_id
    ) values (
      (t ->> 'id')::uuid, p_workspace_id, (t ->> 'wallet_id')::uuid, (t ->> 'to_wallet_id')::uuid,
      (select m.new_id from import_category_map m where m.old_id = (t ->> 'category_id')::uuid),
      (t ->> 'amount')::numeric, (t ->> 'to_amount')::numeric, (t ->> 'currency')::public.currency_code,
      (t ->> 'type')::public.transaction_type, (t ->> 'exchange_rate')::numeric, t ->> 'note', t ->> 'receipt_url',
      (t ->> 'transaction_date')::timestamptz, coalesce((t ->> 'created_at')::timestamptz, now()), (t ->> 'debt_id')::uuid
    )
    on conflict do nothing;
    get diagnostics added = row_count;
    n_transactions := n_transactions + added;
  end loop;

  for d in select value from jsonb_array_elements(coalesce(p_data -> 'debts', '[]'::jsonb)) loop
    if d ->> 'disbursement_transaction_id' is not null then
      update public.debts set disbursement_transaction_id = (d ->> 'disbursement_transaction_id')::uuid
      where id = (d ->> 'id')::uuid and workspace_id = p_workspace_id and disbursement_transaction_id is null
        and exists (select 1 from public.transactions x where x.id = (d ->> 'disbursement_transaction_id')::uuid);
    end if;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_data -> 'repayments', '[]'::jsonb)) loop
    insert into public.debt_repayments (id, debt_id, wallet_id, amount_paid, payment_date, note, transaction_id, created_at)
    values (
      (r ->> 'id')::uuid, (r ->> 'debt_id')::uuid, (r ->> 'wallet_id')::uuid, (r ->> 'amount_paid')::numeric,
      (r ->> 'payment_date')::timestamptz, r ->> 'note', (r ->> 'transaction_id')::uuid,
      coalesce((r ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
    get diagnostics added = row_count;
    n_repayments := n_repayments + added;
  end loop;

  for b in select value from jsonb_array_elements(coalesce(p_data -> 'budgets', '[]'::jsonb)) loop
    mapped := (select m.new_id from import_category_map m where m.old_id = (b ->> 'category_id')::uuid);
    continue when mapped is null;
    insert into public.budgets (workspace_id, category_id, amount, currency)
    values (p_workspace_id, mapped, (b ->> 'amount')::numeric, (b ->> 'currency')::public.currency_code)
    on conflict do nothing;
    get diagnostics added = row_count;
    n_budgets := n_budgets + added;
  end loop;

  perform set_config('luysmart.import', '', true);
  return jsonb_build_object(
    'categories', n_categories, 'wallets', n_wallets, 'transactions', n_transactions,
    'debts', n_debts, 'repayments', n_repayments, 'budgets', n_budgets
  );
end;
$$;
revoke all on function public.import_guest_data(uuid, jsonb) from public, anon;
grant execute on function public.import_guest_data(uuid, jsonb) to authenticated;

-- 5 -------------------------------------------------------------------------
create or replace function public.guard_receipt_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.receipt_url is not null
    and (select auth.uid()) is not null
    and (tg_op = 'INSERT' or new.receipt_url is distinct from old.receipt_url)
    and split_part(new.receipt_url, '/', 1) <> (select auth.uid())::text then
    raise exception 'receipt must be your own upload' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger transactions_receipt_guard
  before insert or update of receipt_url on public.transactions
  for each row execute function public.guard_receipt_owner();

-- 6 -------------------------------------------------------------------------
create or replace function public.guard_debt_disbursement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.disbursement_transaction_id is not null
    and new.disbursement_transaction_id is distinct from old.disbursement_transaction_id
    and not exists (
      select 1 from public.transactions t
      where t.id = new.disbursement_transaction_id and t.debt_id = new.id
    ) then
    raise exception 'disbursement must be this debt''s own ledger row' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace trigger debts_disbursement_guard
  before update of disbursement_transaction_id on public.debts
  for each row execute function public.guard_debt_disbursement();

-- 7 -------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Functions: nothing for anonymous visitors; signed-in users keep what the app
-- uses, minus internal helpers.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke all on function public.adjust_wallet_balances(public.transactions, integer) from authenticated;
revoke all on function public.seed_default_categories(uuid, public.workspace_type) from authenticated;
revoke all on function public.default_display_name(uuid) from authenticated;
revoke all on function public.run_debt_alerts() from authenticated;
