-- ===========================================================================
-- តុងទីន (Tontine / ROSCA) tracker, from the player's side.
--
-- One row in `tontines` per hand (ក្បាល) the user plays. Each round they pay a
-- share; a live member (កូនរស់, hasn't won yet) usually pays the share minus
-- that round's winning bid, a dead member (កូនងាប់, already won) pays the full
-- share. The round they win the bid (ដេញបាន) they collect the pot instead.
--
-- pay_tontine_round() / collect_tontine() record the round and, when a wallet
-- is chosen, the ledger row (expense "បង់តុងទីន" / income "ដេញតុងទីនបាន") in
-- one transaction. Deleting that ledger row undoes the round (or the win).
-- Idempotent: safe to re-run.
-- ===========================================================================

create table if not exists public.tontines (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 60),
  leader_name        text check (leader_name is null or char_length(leader_name) <= 60),
  leader_phone       text check (leader_phone is null or char_length(leader_phone) <= 30),
  currency           public.currency_code not null,
  share_amount       numeric(18, 2) not null check (share_amount > 0),
  frequency          text not null check (frequency in ('WEEKLY', 'MONTHLY')),
  total_rounds       integer not null check (total_rounds between 2 and 100),
  start_date         date not null,
  -- Wallet suggested for payments (optional).
  wallet_id          uuid,
  won_round          integer,
  won_amount         numeric(18, 2) check (won_amount is null or won_amount > 0),
  won_bid            numeric(18, 2) check (won_bid is null or won_bid >= 0),
  won_on             date,
  won_transaction_id uuid references public.transactions (id) on delete set null,
  note               text check (note is null or char_length(note) <= 500),
  closed_at          timestamptz,
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (wallet_id, workspace_id) references public.wallets_accounts (id, workspace_id) on delete set null (wallet_id),
  check (won_round is null or won_round between 1 and total_rounds),
  check ((won_round is null) = (won_amount is null))
);
create index if not exists tontines_workspace_idx on public.tontines (workspace_id, created_at desc);

create table if not exists public.tontine_payments (
  id             uuid primary key default gen_random_uuid(),
  tontine_id     uuid not null,
  workspace_id   uuid not null,
  round_no       integer not null check (round_no > 0),
  amount         numeric(18, 2) not null check (amount > 0),
  -- Live members: how much less than the share they paid (the round's bid).
  discount       numeric(18, 2) not null default 0 check (discount >= 0),
  paid_on        date not null,
  transaction_id uuid unique references public.transactions (id) on delete cascade,
  created_at     timestamptz not null default now(),
  foreign key (tontine_id, workspace_id) references public.tontines (id, workspace_id) on delete cascade,
  unique (tontine_id, round_no)
);
create index if not exists tontine_payments_workspace_idx on public.tontine_payments (workspace_id);

alter table public.tontines enable row level security;
alter table public.tontine_payments enable row level security;
do $$
declare
  t text;
begin
  foreach t in array array['tontines', 'tontine_payments'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_write_workspace(workspace_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_write_workspace(workspace_id))', t);
  end loop;
end
$$;

-- Rounds stay inside the cycle, and the won round is never also a paid one.
create or replace function public.guard_tontine_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t public.tontines;
begin
  select * into t from public.tontines where id = new.tontine_id;
  if new.round_no > t.total_rounds then
    raise exception 'round_out_of_range' using errcode = '22023';
  end if;
  if new.round_no = t.won_round then
    raise exception 'round_is_won' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace trigger tontine_payments_guard
  before insert or update on public.tontine_payments
  for each row execute function public.guard_tontine_payment();

create or replace function public.guard_tontine()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.won_round is not null and exists (
    select 1 from public.tontine_payments p where p.tontine_id = new.id and p.round_no = new.won_round
  ) then
    raise exception 'round_paid' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.total_rounds < coalesce((select max(round_no) from public.tontine_payments p where p.tontine_id = new.id), 0) then
    raise exception 'round_out_of_range' using errcode = '22023';
  end if;
  return new;
end;
$$;
create or replace trigger tontines_guard
  before insert or update on public.tontines
  for each row execute function public.guard_tontine();

-- Deleting the pot's ledger row undoes the win (back to កូនរស់).
create or replace function public.clear_tontine_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tontines
  set won_round = null, won_amount = null, won_bid = null, won_on = null, won_transaction_id = null
  where won_transaction_id = old.id;
  return old;
end;
$$;
create or replace trigger transactions_clear_tontine_win
  before delete on public.transactions
  for each row execute function public.clear_tontine_win();

-- ---------------------------------------------------------------------------
-- Pay one round. With a wallet, also records the expense (in the tontine's
-- currency; exchange_rate when the wallet uses the other one).
-- ---------------------------------------------------------------------------
create or replace function public.pay_tontine_round(
  p_tontine_id uuid, p_round_no integer, p_amount numeric, p_discount numeric, p_paid_on date,
  p_wallet_id uuid, p_exchange_rate numeric, p_note text
)
returns public.tontine_payments
language plpgsql
set search_path = ''
as $$
declare
  t public.tontines;
  w public.wallets_accounts;
  tx_id uuid;
  result public.tontine_payments;
begin
  select * into t from public.tontines where id = p_tontine_id for update;
  if not found then
    raise exception 'tontine not found' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_wallet_id is not null then
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = t.workspace_id;
    if not found then
      raise exception 'wallet not found in this workspace' using errcode = 'P0002';
    end if;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date)
    values (
      t.workspace_id, w.id,
      public.ensure_preset_category(t.workspace_id, 'tontine_payment', 'EXPENSE', 'piggy-bank', '#f59e0b', 'បង់តុងទីន'),
      p_amount, t.currency, 'EXPENSE',
      case when w.currency = t.currency then null else p_exchange_rate end,
      left(coalesce(nullif(btrim(p_note), ''), t.name || ' · #' || p_round_no), 500),
      (coalesce(p_paid_on, current_date) + time '12:00') at time zone 'Asia/Phnom_Penh'
    )
    returning id into tx_id;
  end if;

  insert into public.tontine_payments (tontine_id, workspace_id, round_no, amount, discount, paid_on, transaction_id)
  values (t.id, t.workspace_id, p_round_no, p_amount, greatest(coalesce(p_discount, 0), 0), coalesce(p_paid_on, current_date), tx_id)
  returning * into result;
  return result;
exception when unique_violation then
  raise exception 'round_paid' using errcode = 'P0001';
end;
$$;

-- Won the bid: collect the pot (income into the wallet) and become កូនងាប់.
create or replace function public.collect_tontine(
  p_tontine_id uuid, p_round_no integer, p_amount numeric, p_bid numeric, p_received_on date,
  p_wallet_id uuid, p_exchange_rate numeric, p_note text
)
returns public.tontines
language plpgsql
set search_path = ''
as $$
declare
  t public.tontines;
  w public.wallets_accounts;
  tx_id uuid;
begin
  select * into t from public.tontines where id = p_tontine_id for update;
  if not found then
    raise exception 'tontine not found' using errcode = 'P0002';
  end if;
  if t.won_round is not null then
    raise exception 'already_won' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_wallet_id is not null then
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = t.workspace_id;
    if not found then
      raise exception 'wallet not found in this workspace' using errcode = 'P0002';
    end if;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date)
    values (
      t.workspace_id, w.id,
      public.ensure_preset_category(t.workspace_id, 'tontine_payout', 'INCOME', 'coins', '#10b981', 'ដេញតុងទីនបាន'),
      p_amount, t.currency, 'INCOME',
      case when w.currency = t.currency then null else p_exchange_rate end,
      left(coalesce(nullif(btrim(p_note), ''), t.name || ' · #' || p_round_no), 500),
      (coalesce(p_received_on, current_date) + time '12:00') at time zone 'Asia/Phnom_Penh'
    )
    returning id into tx_id;
  end if;

  update public.tontines
  set won_round = p_round_no, won_amount = p_amount, won_bid = nullif(greatest(coalesce(p_bid, 0), 0), 0),
      won_on = coalesce(p_received_on, current_date), won_transaction_id = tx_id
  where id = t.id
  returning * into t;
  return t;
end;
$$;

-- Undo a win recorded without a ledger row (with one, deleting the row undoes it).
create or replace function public.undo_tontine_win(p_tontine_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t public.tontines;
begin
  select * into t from public.tontines where id = p_tontine_id for update;
  if not found then
    raise exception 'tontine not found' using errcode = 'P0002';
  end if;
  if t.won_transaction_id is not null then
    delete from public.transactions where id = t.won_transaction_id;
  else
    update public.tontines set won_round = null, won_amount = null, won_bid = null, won_on = null where id = t.id;
  end if;
end;
$$;

-- Guest Mode → account: tontines and their rounds (ids kept, like the ledger).
create or replace function public.import_guest_tontines(p_workspace_id uuid, p_data jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  t jsonb;
  p jsonb;
  added integer;
  n integer := 0;
begin
  if not public.can_write_workspace(p_workspace_id) then
    raise exception 'no write access to this workspace' using errcode = '42501';
  end if;
  for t in select value from jsonb_array_elements(coalesce(p_data -> 'tontines', '[]'::jsonb)) loop
    insert into public.tontines (
      id, workspace_id, name, leader_name, leader_phone, currency, share_amount, frequency, total_rounds, start_date,
      wallet_id, won_round, won_amount, won_bid, won_on, won_transaction_id, note, closed_at, created_at
    ) values (
      (t ->> 'id')::uuid, p_workspace_id, t ->> 'name', t ->> 'leader_name', t ->> 'leader_phone',
      (t ->> 'currency')::public.currency_code, (t ->> 'share_amount')::numeric, t ->> 'frequency',
      (t ->> 'total_rounds')::integer, (t ->> 'start_date')::date,
      (select w.id from public.wallets_accounts w where w.id = (t ->> 'wallet_id')::uuid and w.workspace_id = p_workspace_id),
      (t ->> 'won_round')::integer, (t ->> 'won_amount')::numeric, (t ->> 'won_bid')::numeric, (t ->> 'won_on')::date,
      (select x.id from public.transactions x where x.id = (t ->> 'won_transaction_id')::uuid and x.workspace_id = p_workspace_id),
      t ->> 'note', (t ->> 'closed_at')::timestamptz, coalesce((t ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  for p in select value from jsonb_array_elements(coalesce(p_data -> 'payments', '[]'::jsonb)) loop
    insert into public.tontine_payments (id, tontine_id, workspace_id, round_no, amount, discount, paid_on, transaction_id, created_at)
    select (p ->> 'id')::uuid, tn.id, p_workspace_id, (p ->> 'round_no')::integer, (p ->> 'amount')::numeric,
           coalesce((p ->> 'discount')::numeric, 0), (p ->> 'paid_on')::date,
           (select x.id from public.transactions x where x.id = (p ->> 'transaction_id')::uuid and x.workspace_id = p_workspace_id),
           coalesce((p ->> 'created_at')::timestamptz, now())
    from public.tontines tn where tn.id = (p ->> 'tontine_id')::uuid and tn.workspace_id = p_workspace_id
    on conflict do nothing;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default categories: "បង់តុងទីន" (expense) and "ដេញតុងទីនបាន" (income) in
-- every workspace, new and existing. Supersedes the definition in
-- 20261001070100_family_sharing.sql (same presets + the two tontine ones).
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_categories(p_workspace_id uuid, p_type public.workspace_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type in ('PERSONAL', 'FAMILY') then
    insert into public.categories (workspace_id, preset_key, type, icon, color, name) values
      (p_workspace_id, 'food',          'EXPENSE', 'utensils',       '#f97316', 'ម្ហូបអាហារ'),
      (p_workspace_id, 'transport',     'EXPENSE', 'bus',            '#0ea5e9', 'ការធ្វើដំណើរ'),
      (p_workspace_id, 'housing',       'EXPENSE', 'house',          '#8b5cf6', 'ផ្ទះ/ទឹកភ្លើង'),
      (p_workspace_id, 'shopping',      'EXPENSE', 'shopping-bag',   '#ec4899', 'ទិញឥវ៉ាន់'),
      (p_workspace_id, 'phone',         'EXPENSE', 'smartphone',     '#6366f1', 'ទូរស័ព្ទ/អ៊ីនធឺណិត'),
      (p_workspace_id, 'health',        'EXPENSE', 'heart-pulse',    '#ef4444', 'សុខភាព'),
      (p_workspace_id, 'education',     'EXPENSE', 'graduation-cap', '#14b8a6', 'ការសិក្សា'),
      (p_workspace_id, 'family',        'EXPENSE', 'gift',           '#d946ef', 'គ្រួសារ/អំណោយ'),
      (p_workspace_id, 'entertainment', 'EXPENSE', 'film',           '#f59e0b', 'កម្សាន្ត'),
      (p_workspace_id, 'other_expense', 'EXPENSE', 'ellipsis',       '#64748b', 'ចំណាយផ្សេងៗ'),
      (p_workspace_id, 'salary',        'INCOME',  'banknote',       '#16a34a', 'ប្រាក់ខែ'),
      (p_workspace_id, 'bonus',         'INCOME',  'award',          '#22c55e', 'ប្រាក់រង្វាន់'),
      (p_workspace_id, 'side_income',   'INCOME',  'trending-up',    '#10b981', 'ចំណូលបន្ថែម'),
      (p_workspace_id, 'gift_received', 'INCOME',  'hand-heart',     '#84cc16', 'ទទួលអំណោយ'),
      (p_workspace_id, 'other_income',  'INCOME',  'coins',          '#64748b', 'ចំណូលផ្សេងៗ');
  else
    insert into public.categories (workspace_id, preset_key, type, icon, color, name) values
      (p_workspace_id, 'inventory',     'EXPENSE', 'package',        '#f97316', 'ថ្លៃទំនិញ/ស្តុក'),
      (p_workspace_id, 'rent',          'EXPENSE', 'store',          '#8b5cf6', 'ជួលទីតាំង'),
      (p_workspace_id, 'payroll',       'EXPENSE', 'users',          '#0ea5e9', 'ប្រាក់បៀវត្សបុគ្គលិក'),
      (p_workspace_id, 'utilities',     'EXPENSE', 'zap',            '#eab308', 'ទឹកភ្លើង'),
      (p_workspace_id, 'marketing',     'EXPENSE', 'megaphone',      '#ec4899', 'ផ្សព្វផ្សាយ'),
      (p_workspace_id, 'delivery',      'EXPENSE', 'truck',          '#14b8a6', 'ដឹកជញ្ជូន'),
      (p_workspace_id, 'equipment',     'EXPENSE', 'wrench',         '#6366f1', 'សម្ភារៈ/ជួសជុល'),
      (p_workspace_id, 'tax',           'EXPENSE', 'landmark',       '#ef4444', 'ពន្ធ/សេវា'),
      (p_workspace_id, 'other_expense', 'EXPENSE', 'ellipsis',       '#64748b', 'ចំណាយផ្សេងៗ'),
      (p_workspace_id, 'sales',         'INCOME',  'shopping-cart',  '#16a34a', 'ចំណូលពីការលក់'),
      (p_workspace_id, 'services',      'INCOME',  'briefcase',      '#10b981', 'ចំណូលពីសេវាកម្ម'),
      (p_workspace_id, 'investment',    'INCOME',  'piggy-bank',     '#84cc16', 'ដើមទុនវិនិយោគ'),
      (p_workspace_id, 'other_income',  'INCOME',  'coins',          '#64748b', 'ចំណូលផ្សេងៗ');
  end if;
  perform public.ensure_preset_category(p_workspace_id, 'tontine_payment', 'EXPENSE', 'piggy-bank', '#f59e0b', 'បង់តុងទីន');
  perform public.ensure_preset_category(p_workspace_id, 'tontine_payout', 'INCOME', 'coins', '#10b981', 'ដេញតុងទីនបាន');
end;
$$;
revoke all on function public.seed_default_categories(uuid, public.workspace_type) from public, anon, authenticated;

do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces loop
    perform public.ensure_preset_category(ws.id, 'tontine_payment', 'EXPENSE', 'piggy-bank', '#f59e0b', 'បង់តុងទីន');
    perform public.ensure_preset_category(ws.id, 'tontine_payout', 'INCOME', 'coins', '#10b981', 'ដេញតុងទីនបាន');
  end loop;
end
$$;

-- "Reset my data" also clears tontines. Supersedes 20261001070100.
create or replace function public.reset_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  create temporary table reset_ws on commit drop as
    select id, type from public.workspaces where user_id = uid and type <> 'FAMILY';

  delete from public.notifications where workspace_id in (select id from reset_ws);
  delete from public.tontines where workspace_id in (select id from reset_ws);
  delete from public.transactions where workspace_id in (select id from reset_ws);
  delete from public.debts where workspace_id in (select id from reset_ws);
  delete from public.budgets where workspace_id in (select id from reset_ws);
  delete from public.wallets_accounts where workspace_id in (select id from reset_ws);
  delete from public.categories where workspace_id in (select id from reset_ws);
  delete from public.telegram_settings where user_id = uid;

  for ws in select id, type from reset_ws loop
    perform public.seed_default_categories(ws.id, ws.type);
  end loop;
end;
$$;
revoke all on function public.reset_my_data() from public, anon;
grant execute on function public.reset_my_data() to authenticated;

-- Family members see each other's rounds live.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['tontines', 'tontine_payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

revoke all on function public.guard_tontine_payment() from public, anon, authenticated;
revoke all on function public.guard_tontine() from public, anon, authenticated;
revoke all on function public.clear_tontine_win() from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pay_tontine_round(uuid, integer, numeric, numeric, date, uuid, numeric, text)',
    'public.collect_tontine(uuid, integer, numeric, numeric, date, uuid, numeric, text)',
    'public.undo_tontine_win(uuid)',
    'public.import_guest_tontines(uuid, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
