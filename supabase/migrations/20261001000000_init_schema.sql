-- LuyChlat initial schema (guideline.md §3)
-- Every table has Row-Level Security enabled. Ownership is always derived from
-- workspaces.user_id = auth.uid(); child rows reference their workspace through
-- composite foreign keys so a row can never point at another tenant's wallet,
-- category or debt.
--
-- Additions beyond guideline §3 (needed for the referenced FKs / features):
--   * categories                  - referenced by transactions.category_id
--   * transactions.to_wallet_id   - destination wallet for TRANSFER rows
--   * created_at columns          - on every table, for ordering/auditing

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin create type public.workspace_type    as enum ('PERSONAL', 'BUSINESS'); exception when duplicate_object then null; end $$;
do $$ begin create type public.currency_code     as enum ('USD', 'KHR'); exception when duplicate_object then null; end $$;
do $$ begin create type public.transaction_type  as enum ('INCOME', 'EXPENSE', 'TRANSFER'); exception when duplicate_object then null; end $$;
do $$ begin create type public.category_type     as enum ('INCOME', 'EXPENSE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.debt_type         as enum ('PAYABLE', 'RECEIVABLE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.debt_status       as enum ('ACTIVE', 'PARTIALLY_PAID', 'SETTLED', 'OVERDUE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_type as enum ('DUE_DATE', 'SYSTEM', 'AI_ADVICE'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3.1 workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 60),
  type             public.workspace_type not null,
  currency_default public.currency_code not null default 'USD',
  created_at       timestamptz not null default now(),
  unique (user_id, type)
);
create index if not exists workspaces_user_id_idx on public.workspaces (user_id);

-- Ownership check used by every policy. SECURITY DEFINER avoids recursive RLS
-- evaluation; it only ever answers for the calling user.
create or replace function public.owns_workspace(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws_id and w.user_id = (select auth.uid())
  );
$$;
revoke all on function public.owns_workspace(uuid) from public, anon;
grant execute on function public.owns_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3.2 wallets_accounts
-- ---------------------------------------------------------------------------
create table if not exists public.wallets_accounts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  balance      numeric(18, 2) not null default 0,
  currency     public.currency_code not null,
  icon         text,
  created_at   timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists wallets_accounts_workspace_id_idx on public.wallets_accounts (workspace_id);

-- ---------------------------------------------------------------------------
-- categories (supporting table for transactions.category_id)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  type         public.category_type not null,
  icon         text,
  color        text,
  created_at   timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists categories_workspace_id_idx on public.categories (workspace_id);

-- ---------------------------------------------------------------------------
-- 3.3 transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  wallet_id        uuid not null,
  to_wallet_id     uuid,
  category_id      uuid,
  amount           numeric(18, 2) not null check (amount > 0),
  currency         public.currency_code not null,
  type             public.transaction_type not null,
  exchange_rate    numeric(14, 4) check (exchange_rate is null or exchange_rate > 0),
  note             text check (note is null or char_length(note) <= 500),
  receipt_url      text,
  transaction_date timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  foreign key (wallet_id, workspace_id)
    references public.wallets_accounts (id, workspace_id) on delete cascade,
  foreign key (to_wallet_id, workspace_id)
    references public.wallets_accounts (id, workspace_id) on delete cascade,
  foreign key (category_id, workspace_id)
    references public.categories (id, workspace_id) on delete set null (category_id),
  check (
    (type = 'TRANSFER' and to_wallet_id is not null and to_wallet_id <> wallet_id)
    or (type <> 'TRANSFER' and to_wallet_id is null)
  )
);
create index if not exists transactions_workspace_date_idx on public.transactions (workspace_id, transaction_date desc);
create index if not exists transactions_wallet_id_idx on public.transactions (wallet_id);
create index if not exists transactions_to_wallet_id_idx on public.transactions (to_wallet_id);
create index if not exists transactions_category_id_idx on public.transactions (category_id);

-- ---------------------------------------------------------------------------
-- 3.4 debts
-- ---------------------------------------------------------------------------
create table if not exists public.debts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  type          public.debt_type not null,
  party_name    text not null check (char_length(party_name) between 1 and 100),
  contact_phone text,
  total_amount  numeric(18, 2) not null check (total_amount > 0),
  paid_amount   numeric(18, 2) not null default 0 check (paid_amount >= 0),
  currency      public.currency_code not null,
  interest_rate numeric(7, 4) not null default 0 check (interest_rate >= 0),
  due_date      date,
  status        public.debt_status not null default 'ACTIVE',
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists debts_workspace_id_idx on public.debts (workspace_id);
create index if not exists debts_due_date_idx on public.debts (due_date) where status <> 'SETTLED';

-- ---------------------------------------------------------------------------
-- 3.5 debt_repayments
-- ---------------------------------------------------------------------------
create table if not exists public.debt_repayments (
  id           uuid primary key default gen_random_uuid(),
  debt_id      uuid not null references public.debts (id) on delete cascade,
  wallet_id    uuid not null references public.wallets_accounts (id) on delete restrict,
  amount_paid  numeric(18, 2) not null check (amount_paid > 0),
  payment_date timestamptz not null default now(),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists debt_repayments_debt_id_idx on public.debt_repayments (debt_id);
create index if not exists debt_repayments_wallet_id_idx on public.debt_repayments (wallet_id);

-- debt_repayments has no workspace_id column (per guideline), so tenant
-- consistency between the debt and the wallet is enforced here.
create or replace function public.debt_repayment_same_workspace(p_debt_id uuid, p_wallet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.debts d
    join public.wallets_accounts w on w.workspace_id = d.workspace_id
    join public.workspaces ws on ws.id = d.workspace_id
    where d.id = p_debt_id
      and w.id = p_wallet_id
      and ws.user_id = (select auth.uid())
  );
$$;
revoke all on function public.debt_repayment_same_workspace(uuid, uuid) from public, anon;
grant execute on function public.debt_repayment_same_workspace(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3.6 notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  debt_id      uuid,
  title        text not null,
  message      text not null,
  type         public.notification_type not null,
  is_read      boolean not null default false,
  scheduled_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  foreign key (debt_id, workspace_id)
    references public.debts (id, workspace_id) on delete cascade
);
create index if not exists notifications_workspace_scheduled_idx on public.notifications (workspace_id, scheduled_at desc);
create index if not exists notifications_debt_id_idx on public.notifications (debt_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.workspaces       enable row level security;
alter table public.wallets_accounts enable row level security;
alter table public.categories       enable row level security;
alter table public.transactions     enable row level security;
alter table public.debts            enable row level security;
alter table public.debt_repayments  enable row level security;
alter table public.notifications    enable row level security;

-- workspaces: owner only. Workspaces are created by the signup trigger, so
-- clients may read and rename them but not insert or delete.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Workspace-scoped tables share one policy shape.
do $$
declare
  t text;
begin
  foreach t in array array['wallets_accounts', 'categories', 'transactions', 'debts', 'notifications']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (public.owns_workspace(workspace_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.owns_workspace(workspace_id))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (public.owns_workspace(workspace_id))', t);
  end loop;
end
$$;

drop policy if exists debt_repayments_select on public.debt_repayments;
create policy debt_repayments_select on public.debt_repayments
  for select to authenticated using (public.debt_repayment_same_workspace(debt_id, wallet_id));
drop policy if exists debt_repayments_insert on public.debt_repayments;
create policy debt_repayments_insert on public.debt_repayments
  for insert to authenticated with check (public.debt_repayment_same_workspace(debt_id, wallet_id));
drop policy if exists debt_repayments_update on public.debt_repayments;
create policy debt_repayments_update on public.debt_repayments
  for update to authenticated
  using (public.debt_repayment_same_workspace(debt_id, wallet_id))
  with check (public.debt_repayment_same_workspace(debt_id, wallet_id));
drop policy if exists debt_repayments_delete on public.debt_repayments;
create policy debt_repayments_delete on public.debt_repayments
  for delete to authenticated using (public.debt_repayment_same_workspace(debt_id, wallet_id));

-- ---------------------------------------------------------------------------
-- Signup bootstrap: every new user gets a Personal and a Business workspace.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspaces (user_id, name, type)
  values
    (new.id, 'ផ្ទាល់ខ្លួន', 'PERSONAL'),
    (new.id, 'អាជីវកម្ម', 'BUSINESS');
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
