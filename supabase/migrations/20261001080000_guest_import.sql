-- Guest Mode -> account: moves a guest's data into a signed-in account.
--
-- public.import_guest_data() imports one workspace's worth of guest data in a
-- single transaction (all or nothing). It runs as the caller, so RLS still
-- decides where they may write. Guest ids are kept, and every insert is
-- "on conflict do nothing", so importing the same data twice adds nothing.
-- Wallets arrive with their opening balance and the ledger is replayed in
-- creation order, so the balance triggers end on the guest's balances.

create or replace function public.adjust_wallet_balances(t public.transactions, direction integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  source_currency public.currency_code;
  target_currency public.currency_code;
  delta numeric;
begin
  select currency into source_currency from public.wallets_accounts where id = t.wallet_id;

  if t.type in ('INCOME', 'EXPENSE') then
    if t.currency <> source_currency and t.exchange_rate is null then
      raise exception 'exchange_rate is required when currency differs from the wallet' using errcode = '22023';
    end if;
    delta := public.amount_in_wallet_currency(t.amount, t.currency, t.exchange_rate, source_currency);
    if t.type = 'EXPENSE' then
      delta := -delta;
    end if;
    update public.wallets_accounts set balance = balance + direction * delta where id = t.wallet_id;
    return;
  end if;

  -- TRANSFER
  if direction > 0 then
    if source_currency is distinct from t.currency then
      raise exception 'transfer currency % does not match wallet currency %', t.currency, source_currency
        using errcode = '22023';
    end if;
    select currency into target_currency from public.wallets_accounts where id = t.to_wallet_id;
    if target_currency is distinct from t.currency and t.exchange_rate is null then
      raise exception 'cross-currency transfer requires exchange_rate' using errcode = '22023';
    end if;
  end if;
  update public.wallets_accounts set balance = balance - direction * t.amount where id = t.wallet_id;
  update public.wallets_accounts set balance = balance + direction * t.to_amount where id = t.to_wallet_id;
  -- A Guest Mode import replays history in creation order, which can dip
  -- below zero in between (e.g. after an edited income); skip the check then.
  if direction > 0 and coalesce(current_setting('luysmart.import', true), '') <> 'on' and exists (
    select 1 from public.wallets_accounts where id = t.wallet_id and balance < 0
  ) then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.notify_workspace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_type public.workspace_type;
  actor text := coalesce(new.created_by_name, 'Member');
  amount_text text := public.format_money_text(new.amount, new.currency);
  cat_name text;
  from_name text;
  to_name text;
  m record;
  lang text;
  title text;
  body text;
  esc_title text;
  esc_body text;
begin
  -- Imported history isn't news for the other members.
  if coalesce(current_setting('luysmart.import', true), '') = 'on' then
    return null;
  end if;
  select type into ws_type from public.workspaces where id = new.workspace_id;
  if ws_type is distinct from 'FAMILY' or new.created_by is null then
    return null;
  end if;
  select name into cat_name from public.categories where id = new.category_id;
  select name into from_name from public.wallets_accounts where id = new.wallet_id;
  select name into to_name from public.wallets_accounts where id = new.to_wallet_id;

  for m in
    select wm.user_id, ts.bot_token, ts.chat_id, ts.enabled, ts.language
    from public.workspace_members wm
    left join public.telegram_settings ts on ts.user_id = wm.user_id
    where wm.workspace_id = new.workspace_id and wm.user_id <> new.created_by
  loop
    lang := coalesce(m.language, 'km');
    if lang = 'km' then
      title := actor || case new.type
        when 'EXPENSE' then ' បានកត់ចំណាយ ' || amount_text || coalesce(' លើ «' || cat_name || '»', '')
        when 'INCOME' then ' បានកត់ចំណូល ' || amount_text || coalesce(' ពី «' || cat_name || '»', '')
        else ' បានផ្ទេរ ' || amount_text || ' ពី «' || coalesce(from_name, '?') || '» ទៅ «' || coalesce(to_name, '?') || '»'
      end;
      body := case when new.type = 'TRANSFER' then '' else 'កាបូប: ' || coalesce(from_name, '?') end
        || coalesce(case when new.type = 'TRANSFER' then '' else E'\n' end || 'កំណត់ចំណាំ: ' || nullif(new.note, ''), '');
    else
      title := actor || case new.type
        when 'EXPENSE' then ' recorded an expense of ' || amount_text || coalesce(' on "' || cat_name || '"', '')
        when 'INCOME' then ' recorded income of ' || amount_text || coalesce(' from "' || cat_name || '"', '')
        else ' transferred ' || amount_text || ' from "' || coalesce(from_name, '?') || '" to "' || coalesce(to_name, '?') || '"'
      end;
      body := case when new.type = 'TRANSFER' then '' else 'Wallet: ' || coalesce(from_name, '?') end
        || coalesce(case when new.type = 'TRANSFER' then '' else E'\n' end || 'Note: ' || nullif(new.note, ''), '');
    end if;

    insert into public.notifications (workspace_id, user_id, transaction_id, actor_name, title, message, type, scheduled_at)
    values (new.workspace_id, m.user_id, new.id, left(actor, 40), left(title, 300), left(body, 2000), 'ACTIVITY', now());

    if m.bot_token is not null and m.enabled then
      esc_title := replace(replace(replace(title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
      esc_body := replace(replace(replace(body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || m.bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', m.chat_id,
          'parse_mode', 'HTML',
          'text', '🔔 <b>' || esc_title || '</b>' || case when esc_body = '' then '' else E'\n' || esc_body end
            || E'\n\n— លុយឆ្លាត · LuyChlat'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  end loop;
  return null;
end;
$$;

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
  if not public.can_write_workspace(p_workspace_id) then
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
