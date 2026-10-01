-- Phase 3: income/expense ledger, category presets, receipts.

-- ---------------------------------------------------------------------------
-- categories: preset key (translated in the UI until the user renames it)
-- ---------------------------------------------------------------------------
alter table public.categories
  add column preset_key text;

-- Default categories per workspace type.
-- Keep in sync with src/lib/categories/presets.ts.
create or replace function public.seed_default_categories(p_workspace_id uuid, p_type public.workspace_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type = 'PERSONAL' then
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
end;
$$;
revoke all on function public.seed_default_categories(uuid, public.workspace_type) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_id uuid;
  business_id uuid;
begin
  insert into public.workspaces (user_id, name, type) values (new.id, 'ផ្ទាល់ខ្លួន', 'PERSONAL')
    returning id into personal_id;
  insert into public.workspaces (user_id, name, type) values (new.id, 'អាជីវកម្ម', 'BUSINESS')
    returning id into business_id;
  perform public.seed_default_categories(personal_id, 'PERSONAL');
  perform public.seed_default_categories(business_id, 'BUSINESS');
  return new;
end;
$$;

-- Backfill workspaces created before this migration.
select public.seed_default_categories(w.id, w.type)
from public.workspaces w
where not exists (select 1 from public.categories c where c.workspace_id = w.id);

-- A transaction's category must match its kind (income vs expense).
create or replace function public.guard_transaction_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and (
    new.type = 'TRANSFER' or not exists (
      select 1 from public.categories c where c.id = new.category_id and c.type::text = new.type::text
    )
  ) then
    raise exception 'category type does not match transaction type' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger transactions_category_guard
  before insert or update of category_id, type on public.transactions
  for each row execute function public.guard_transaction_category();

-- ---------------------------------------------------------------------------
-- Balances: income/expense may be entered in the other currency.
-- `amount`/`currency` are what the user typed; the wallet moves by the
-- amount converted at `exchange_rate` (KHR per 1 USD), rounded to the wallet
-- currency (cents for USD, whole riel for KHR). Transfers still require the
-- source wallet's currency and carry `to_amount` explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.amount_in_wallet_currency(
  p_amount numeric, p_currency public.currency_code, p_rate numeric, p_wallet_currency public.currency_code
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_currency = p_wallet_currency then p_amount
    when p_currency = 'USD' then round(p_amount * p_rate, 0)
    else round(p_amount / p_rate, 2)
  end;
$$;

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
  if direction > 0 and exists (
    select 1 from public.wallets_accounts where id = t.wallet_id and balance < 0
  ) then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;
end;
$$;

create index transactions_workspace_type_date_idx on public.transactions (workspace_id, type, transaction_date desc);

-- ---------------------------------------------------------------------------
-- Receipts: private bucket, one folder per user: receipts/<auth.uid()>/<file>.
-- transactions.receipt_url stores the object path; the app shows it through
-- short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
