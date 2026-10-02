-- Phase 7: family / couple workspace sharing, attribution, realtime, budgets.
--
-- Access model (replaces "owner only" from the initial schema):
--   * workspace_members lists who can open a workspace and with which role.
--     OWNER  - the workspace's creator (workspaces.user_id); manages members
--     MEMBER - reads and writes the shared ledger
--     VIEWER - read only
--   * Personal and Business workspaces keep a single OWNER member. Only the
--     FAMILY workspace (one per owner, created on demand) can be shared, using
--     single-use 6-character invite codes.
--   * Wallets in a shared workspace are SHARED (anyone who can write may use
--     them) or PERSONAL (everyone sees them, only owner_id may move money).
--   * transactions / debts / debt_repayments record who created them.

do $$ begin create type public.workspace_role    as enum ('OWNER', 'MEMBER', 'VIEWER'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wallet_visibility as enum ('SHARED', 'PERSONAL'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles: the display name shown as "កត់ដោយ៖ ..." to other members
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Name from the sign-in provider, else the e-mail's local part, else the phone's last digits.
create or replace function public.default_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    case when u.phone is not null and u.phone <> '' then '•••' || right(u.phone, 3) end,
    'Member'
  ), 40)
  from auth.users u
  where u.id = p_user_id;
$$;
revoke all on function public.default_display_name(uuid) from public, anon, authenticated;

insert into public.profiles (id, display_name)
select u.id, public.default_display_name(u.id) from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'MEMBER',
  joined_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);
create unique index if not exists workspace_members_one_owner_idx on public.workspace_members (workspace_id) where role = 'OWNER';
alter table public.workspace_members enable row level security;

insert into public.workspace_members (workspace_id, user_id, role, joined_at)
select w.id, w.user_id, 'OWNER', w.created_at from public.workspaces w
on conflict (workspace_id, user_id) do nothing;

-- The creator of every workspace is its OWNER member.
create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.user_id, coalesce(public.default_display_name(new.user_id), 'Member'))
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.user_id, 'OWNER')
  on conflict (workspace_id, user_id) do nothing;
  return null;
end;
$$;

create or replace trigger workspaces_add_owner
  after insert on public.workspaces
  for each row execute function public.add_workspace_owner();

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER avoids recursive RLS; they only ever
-- answer for the calling user).
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_write_workspace(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()) and m.role in ('OWNER', 'MEMBER')
  );
$$;

-- True when the caller and p_user_id are both members of some workspace.
create or replace function public.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.can_write_workspace(uuid) from public, anon;
revoke all on function public.shares_workspace_with(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_write_workspace(uuid) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- The owner changes roles of others; nobody can become or stop being OWNER.
drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (public.owns_workspace(workspace_id) and role <> 'OWNER')
  with check (public.owns_workspace(workspace_id) and role in ('MEMBER', 'VIEWER'));
-- The owner removes members; members may leave. The owner row stays.
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (role <> 'OWNER' and (public.owns_workspace(workspace_id) or user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Workspace-scoped RLS: members read, OWNER/MEMBER write.
-- ---------------------------------------------------------------------------
drop policy if exists workspaces_select on public.workspaces;
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

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
  end loop;
  foreach t in array array['categories', 'transactions', 'debts']
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_write_workspace(workspace_id))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_write_workspace(workspace_id))', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Wallets: shared vs personal
-- ---------------------------------------------------------------------------
alter table public.wallets_accounts
  add column if not exists visibility public.wallet_visibility not null default 'SHARED',
  add column if not exists owner_id   uuid references auth.users (id) on delete set null default (auth.uid());

update public.wallets_accounts w set owner_id = ws.user_id
from public.workspaces ws
where ws.id = w.workspace_id and w.owner_id is null;

drop policy if exists wallets_accounts_select on public.wallets_accounts;
create policy wallets_accounts_select on public.wallets_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists wallets_accounts_insert on public.wallets_accounts;
create policy wallets_accounts_insert on public.wallets_accounts
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and owner_id = (select auth.uid()));
-- Balance updates from the ledger trigger run as the caller, so this also
-- covers money movements (personal wallets are additionally guarded below).
drop policy if exists wallets_accounts_update on public.wallets_accounts;
create policy wallets_accounts_update on public.wallets_accounts
  for update to authenticated
  using (public.can_write_workspace(workspace_id) and (visibility = 'SHARED' or owner_id = (select auth.uid())))
  with check (public.can_write_workspace(workspace_id) and (visibility = 'SHARED' or owner_id = (select auth.uid())));
drop policy if exists wallets_accounts_delete on public.wallets_accounts;
create policy wallets_accounts_delete on public.wallets_accounts
  for delete to authenticated
  using (public.can_write_workspace(workspace_id) and (visibility = 'SHARED' or owner_id = (select auth.uid())));

-- owner_id is set once (the creator); only the owner may change visibility.
-- System code (member removal) sets luysmart.system for the transaction.
create or replace function public.guard_wallet_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.owner_id := uid;
    end if;
    return new;
  end if;
  new.owner_id := old.owner_id;
  if new.visibility is distinct from old.visibility
    and uid is not null
    and coalesce(current_setting('luysmart.system', true), '') <> 'on'
    and old.owner_id is distinct from uid then
    raise exception 'only the wallet owner can change its visibility' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger wallets_accounts_owner_guard
  before insert or update on public.wallets_accounts
  for each row execute function public.guard_wallet_owner();

-- Money may only move through a PERSONAL wallet by its owner (inserts,
-- deletes, and edits of money fields; editing a note stays possible).
create or replace function public.guard_personal_wallet_use()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ids uuid[] := '{}';
begin
  if uid is not null and coalesce(current_setting('luysmart.system', true), '') <> 'on' then
    if tg_op = 'UPDATE' then
      if (new.wallet_id, new.to_wallet_id, new.amount, new.to_amount, new.currency, new.type, new.exchange_rate)
          is not distinct from (old.wallet_id, old.to_wallet_id, old.amount, old.to_amount, old.currency, old.type, old.exchange_rate) then
        return new;
      end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      ids := ids || new.wallet_id || new.to_wallet_id;
    end if;
    if tg_op in ('UPDATE', 'DELETE') then
      ids := ids || old.wallet_id || old.to_wallet_id;
    end if;
    if exists (
      select 1 from public.wallets_accounts w
      where w.id = any (ids) and w.visibility = 'PERSONAL' and w.owner_id is distinct from uid
    ) then
      raise exception 'personal_wallet: only its owner can use this wallet' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger transactions_personal_wallet_guard
  before insert or update or delete on public.transactions
  for each row execute function public.guard_personal_wallet_use();

-- ---------------------------------------------------------------------------
-- Attribution: who recorded a transaction, debt or repayment. The name is a
-- snapshot so the ledger still reads correctly after someone leaves.
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists created_by      uuid references auth.users (id) on delete set null,
  add column if not exists created_by_name text check (created_by_name is null or char_length(created_by_name) <= 40);
alter table public.debts
  add column if not exists created_by      uuid references auth.users (id) on delete set null,
  add column if not exists created_by_name text check (created_by_name is null or char_length(created_by_name) <= 40);
alter table public.debt_repayments
  add column if not exists created_by      uuid references auth.users (id) on delete set null,
  add column if not exists created_by_name text check (created_by_name is null or char_length(created_by_name) <= 40);

-- Backfill (rows not yet attributed): everything so far was recorded by the workspace owner. Triggers
-- are off so balances and derived debt fields aren't recomputed.
alter table public.transactions disable trigger user;
update public.transactions t set created_by = ws.user_id, created_by_name = p.display_name
from public.workspaces ws join public.profiles p on p.id = ws.user_id
where ws.id = t.workspace_id and t.created_by is null;
alter table public.transactions enable trigger user;

alter table public.debts disable trigger user;
update public.debts d set created_by = ws.user_id, created_by_name = p.display_name
from public.workspaces ws join public.profiles p on p.id = ws.user_id
where ws.id = d.workspace_id and d.created_by is null;
alter table public.debts enable trigger user;

alter table public.debt_repayments disable trigger user;
update public.debt_repayments r set created_by = t.created_by, created_by_name = t.created_by_name
from public.transactions t
where t.id = r.transaction_id and r.created_by is null;
alter table public.debt_repayments enable trigger user;

create or replace function public.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.created_by_name := coalesce(
      (select p.display_name from public.profiles p where p.id = new.created_by),
      new.created_by_name
    );
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
  end if;
  return new;
end;
$$;

create or replace trigger transactions_stamp_created_by
  before insert or update on public.transactions
  for each row execute function public.stamp_created_by();
create or replace trigger debts_stamp_created_by
  before insert or update on public.debts
  for each row execute function public.stamp_created_by();
create or replace trigger debt_repayments_stamp_created_by
  before insert on public.debt_repayments
  for each row execute function public.stamp_created_by();

-- ---------------------------------------------------------------------------
-- debt_repayments: same membership rules through the debt and wallet.
-- ---------------------------------------------------------------------------
drop policy if exists debt_repayments_select on public.debt_repayments;
drop policy if exists debt_repayments_insert on public.debt_repayments;
drop policy if exists debt_repayments_delete on public.debt_repayments;
drop function if exists public.debt_repayment_same_workspace(uuid, uuid);

create or replace function public.debt_repayment_access(p_debt_id uuid, p_wallet_id uuid, p_write boolean)
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
    join public.workspace_members m on m.workspace_id = d.workspace_id
    where d.id = p_debt_id
      and w.id = p_wallet_id
      and m.user_id = (select auth.uid())
      and (not p_write or m.role in ('OWNER', 'MEMBER'))
  );
$$;
revoke all on function public.debt_repayment_access(uuid, uuid, boolean) from public, anon;
grant execute on function public.debt_repayment_access(uuid, uuid, boolean) to authenticated;

drop policy if exists debt_repayments_select on public.debt_repayments;
create policy debt_repayments_select on public.debt_repayments
  for select to authenticated using (public.debt_repayment_access(debt_id, wallet_id, false));
drop policy if exists debt_repayments_insert on public.debt_repayments;
create policy debt_repayments_insert on public.debt_repayments
  for insert to authenticated with check (public.debt_repayment_access(debt_id, wallet_id, true));
drop policy if exists debt_repayments_delete on public.debt_repayments;
create policy debt_repayments_delete on public.debt_repayments
  for delete to authenticated using (public.debt_repayment_access(debt_id, wallet_id, true));

-- ---------------------------------------------------------------------------
-- Notifications: optional recipient (null = everyone in the workspace).
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists user_id        uuid references auth.users (id) on delete cascade,
  add column if not exists transaction_id uuid references public.transactions (id) on delete cascade,
  add column if not exists actor_name     text check (actor_name is null or char_length(actor_name) <= 40);
create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_transaction_id_idx on public.notifications (transaction_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (public.is_workspace_member(workspace_id) and (user_id is null or user_id = (select auth.uid())));
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and (user_id is null or user_id = (select auth.uid())));
-- Any member may mark what they can see as read.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (public.is_workspace_member(workspace_id) and (user_id is null or user_id = (select auth.uid())))
  with check (public.is_workspace_member(workspace_id) and (user_id is null or user_id = (select auth.uid())));
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (public.can_write_workspace(workspace_id) and (user_id is null or user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Family workspace + invitations
-- ---------------------------------------------------------------------------
-- Family uses the personal category presets.
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
end;
$$;
revoke all on function public.seed_default_categories(uuid, public.workspace_type) from public, anon, authenticated;

-- New users: profile first (members reference it), then the two workspaces.
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
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(public.default_display_name(new.id), 'Member'))
  on conflict (id) do nothing;
  insert into public.workspaces (user_id, name, type) values (new.id, 'ផ្ទាល់ខ្លួន', 'PERSONAL')
    returning id into personal_id;
  insert into public.workspaces (user_id, name, type) values (new.id, 'អាជីវកម្ម', 'BUSINESS')
    returning id into business_id;
  perform public.seed_default_categories(personal_id, 'PERSONAL');
  perform public.seed_default_categories(business_id, 'BUSINESS');
  return new;
end;
$$;

create or replace function public.create_family_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result public.workspaces;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspaces where user_id = uid and type = 'FAMILY') then
    raise exception 'family_exists' using errcode = '23505';
  end if;
  insert into public.workspaces (user_id, name, type)
  values (uid, coalesce(nullif(left(trim(p_name), 60), ''), 'គ្រួសារ'), 'FAMILY')
  returning * into result;
  perform public.seed_default_categories(result.id, 'FAMILY');
  return result;
end;
$$;
revoke all on function public.create_family_workspace(text) from public, anon;
grant execute on function public.create_family_workspace(text) to authenticated;

-- Only the owner's family workspace can be deleted (Personal/Business always
-- exist). Everything in it goes, including members' personal wallets.
create or replace function public.delete_family_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and user_id = (select auth.uid()) and type = 'FAMILY'
  ) then
    raise exception 'only the owner can delete the family workspace' using errcode = '42501';
  end if;
  perform set_config('luysmart.system', 'on', true);
  -- Ledger first (cascades repayments), then debts: wallets are referenced
  -- with NO ACTION, which a single cascading delete would trip over.
  delete from public.transactions where workspace_id = p_workspace_id;
  delete from public.debts where workspace_id = p_workspace_id;
  delete from public.workspaces where id = p_workspace_id;
  perform set_config('luysmart.system', '', true);
end;
$$;
revoke all on function public.delete_family_workspace(uuid) from public, anon;
grant execute on function public.delete_family_workspace(uuid) to authenticated;

-- Single-use codes: 6 characters without look-alikes (no I, O, 0, 1).
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  role         public.workspace_role not null default 'MEMBER' check (role in ('MEMBER', 'VIEWER')),
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  used_by      uuid references auth.users (id) on delete set null,
  used_at      timestamptz
);
create index if not exists workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);
alter table public.workspace_invites enable row level security;
drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select to authenticated using (public.owns_workspace(workspace_id));
drop policy if exists workspace_invites_delete on public.workspace_invites;
create policy workspace_invites_delete on public.workspace_invites
  for delete to authenticated using (public.owns_workspace(workspace_id));

-- Failed code lookups, to slow down guessing (10 per hour per user).
create table if not exists public.invite_failures (
  user_id      uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invite_failures_user_idx on public.invite_failures (user_id, attempted_at);
alter table public.invite_failures enable row level security;

create or replace function public.create_workspace_invite(p_workspace_id uuid, p_role public.workspace_role default 'MEMBER')
returns public.workspace_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  new_code text;
  result public.workspace_invites;
begin
  if not public.owns_workspace(p_workspace_id) then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and type = 'FAMILY') then
    raise exception 'only a family workspace can be shared' using errcode = '22023';
  end if;
  if p_role not in ('MEMBER', 'VIEWER') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_invites
      where workspace_id = p_workspace_id and used_at is null and expires_at > now()) >= 10 then
    raise exception 'too_many_invites' using errcode = '22023';
  end if;

  for attempt in 1..10 loop
    -- The first 6 bytes of a v4 UUID are random; 256 is a multiple of 32, so no bias.
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    for i in 0..5 loop
      new_code := new_code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
    end loop;
    begin
      insert into public.workspace_invites (workspace_id, code, role, created_by)
      values (p_workspace_id, new_code, p_role, uid)
      returning * into result;
      return result;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  raise exception 'could not generate a code' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_workspace_invite(uuid, public.workspace_role) from public, anon;
grant execute on function public.create_workspace_invite(uuid, public.workspace_role) to authenticated;

-- Looks up a code. Returns {status: ok|invalid|expired|used|rate_limited, ...}.
-- Failures are counted (not raised) so they survive the transaction.
create or replace function public.lookup_workspace_invite(p_code text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv public.workspace_invites;
  ws public.workspaces;
  inviter text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.invite_failures
      where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into inv from public.workspace_invites where code = normalized for update;
  if not found then
    insert into public.invite_failures (user_id) values (uid);
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;

  if exists (select 1 from public.workspace_members where workspace_id = inv.workspace_id and user_id = uid) then
    return jsonb_build_object('status', 'already_member', 'workspace_id', ws.id, 'workspace_name', ws.name);
  end if;
  if inv.used_at is not null then
    return jsonb_build_object('status', 'used');
  end if;
  if inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select display_name into inviter from public.profiles where id = inv.created_by;
  if not p_accept then
    return jsonb_build_object(
      'status', 'ok', 'workspace_id', ws.id, 'workspace_name', ws.name,
      'inviter_name', coalesce(inviter, ''), 'role', inv.role
    );
  end if;

  insert into public.profiles (id, display_name)
  values (uid, coalesce(public.default_display_name(uid), 'Member'))
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, uid, inv.role);
  update public.workspace_invites set used_by = uid, used_at = now() where id = inv.id;
  return jsonb_build_object('status', 'ok', 'workspace_id', ws.id, 'workspace_name', ws.name, 'role', inv.role);
end;
$$;
revoke all on function public.lookup_workspace_invite(text, boolean) from public, anon;
grant execute on function public.lookup_workspace_invite(text, boolean) to authenticated;

-- A member who leaves (or is removed) keeps nothing private behind: their
-- personal wallets become shared, and their own alerts there are removed.
create or replace function public.on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('luysmart.system', 'on', true);
  update public.wallets_accounts set visibility = 'SHARED'
  where workspace_id = old.workspace_id and owner_id = old.user_id and visibility = 'PERSONAL';
  perform set_config('luysmart.system', '', true);
  delete from public.notifications where workspace_id = old.workspace_id and user_id = old.user_id;
  return null;
end;
$$;

create or replace trigger workspace_members_removed
  after delete on public.workspace_members
  for each row execute function public.on_member_removed();

-- ---------------------------------------------------------------------------
-- Activity alerts: when someone records income/expense/transfer in a family
-- workspace, every other member gets an in-app alert and, if they set up
-- Telegram, a message from their own bot.
-- ---------------------------------------------------------------------------
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

create or replace trigger transactions_notify_activity
  after insert on public.transactions
  for each row execute function public.notify_workspace_activity();

-- ---------------------------------------------------------------------------
-- Daily debt alerts: Telegram now goes to every member who set up a bot.
-- ---------------------------------------------------------------------------
create or replace function public.debt_alert_text(d public.debts, p_stage text, p_days integer, p_lang text, out title text, out body text)
language plpgsql
stable
set search_path = ''
as $$
declare
  safe_name text := replace(replace(replace(d.party_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  left_amount numeric := d.total_amount - d.paid_amount;
begin
  if p_lang = 'km' then
    title := case p_stage
      when 'OVERDUE' then '🔴 បំណុលហួសកំណត់'
      when 'D0' then '🔴 ដល់ថ្ងៃកំណត់ថ្ងៃនេះ'
      else '🟠 ជិតដល់ថ្ងៃកំណត់ (' || p_days || ' ថ្ងៃទៀត)'
    end;
    body := case when d.type = 'PAYABLE' then '📤 ត្រូវសងគេ: ' else '📥 គេជំពាក់យើង: ' end || safe_name
      || E'\n💰 នៅខ្វះ: ' || public.format_money_text(left_amount, d.currency)
      || ' / ' || public.format_money_text(d.total_amount, d.currency)
      || E'\n📅 ថ្ងៃកំណត់: ' || to_char(d.due_date, 'DD/MM/YYYY');
  else
    title := case p_stage
      when 'OVERDUE' then '🔴 Debt overdue'
      when 'D0' then '🔴 Due today'
      else '🟠 Due soon (' || p_days || ' days left)'
    end;
    body := case when d.type = 'PAYABLE' then '📤 I owe: ' else '📥 Owed to me: ' end || safe_name
      || E'\n💰 Remaining: ' || public.format_money_text(left_amount, d.currency)
      || ' of ' || public.format_money_text(d.total_amount, d.currency)
      || E'\n📅 Due: ' || to_char(d.due_date, 'DD/MM/YYYY');
  end if;
end;
$$;

create or replace function public.run_debt_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  d public.debts;
  m record;
  stage text;
  days integer;
  txt record;
  new_id uuid;
  sent integer := 0;
begin
  -- Keep stored statuses fresh (OVERDUE depends on the date).
  update public.debts set paid_amount = paid_amount
  where status in ('ACTIVE', 'PARTIALLY_PAID') and due_date < current_date;

  for d in select * from public.debts where status <> 'SETTLED' and due_date is not null loop
    stage := public.debt_alert_stage(d.due_date, today);
    continue when stage is null;
    days := d.due_date - today;

    -- In-app text is re-rendered in the viewer's language by the app.
    select * into txt from public.debt_alert_text(d, stage, days, 'km');
    new_id := null;
    insert into public.notifications (workspace_id, debt_id, title, message, type, alert_key, scheduled_at)
    values (d.workspace_id, d.id, txt.title, txt.body, 'DUE_DATE', stage, now())
    on conflict (debt_id, alert_key) do nothing
    returning id into new_id;
    continue when new_id is null;

    for m in
      select ts.bot_token, ts.chat_id, ts.language
      from public.workspace_members wm
      join public.telegram_settings ts on ts.user_id = wm.user_id
      where wm.workspace_id = d.workspace_id and ts.enabled
    loop
      select * into txt from public.debt_alert_text(d, stage, days, m.language);
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || m.bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', m.chat_id,
          'parse_mode', 'HTML',
          'text', '<b>' || txt.title || E'</b>\n' || txt.body || E'\n\n— លុយឆ្លាត · LuyChlat'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;
revoke all on function public.run_debt_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reset: only the caller's Personal and Business data. A shared family
-- ledger is removed by deleting the family workspace instead.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Category budgets: a monthly spending cap per expense category.
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category_id  uuid not null,
  amount       numeric(18, 2) not null check (amount > 0),
  currency     public.currency_code not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, category_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id) on delete cascade
);
alter table public.budgets enable row level security;
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists budgets_insert on public.budgets;
create policy budgets_insert on public.budgets
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists budgets_update on public.budgets;
create policy budgets_update on public.budgets
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
drop policy if exists budgets_delete on public.budgets;
create policy budgets_delete on public.budgets
  for delete to authenticated using (public.can_write_workspace(workspace_id));

create or replace function public.guard_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.type = 'EXPENSE') then
    raise exception 'budgets apply to expense categories' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger budgets_guard
  before insert or update on public.budgets
  for each row execute function public.guard_budget_category();

-- ---------------------------------------------------------------------------
-- Receipts: members may view photos attached to their workspace's ledger.
-- ---------------------------------------------------------------------------
create index if not exists transactions_receipt_url_idx on public.transactions (receipt_url) where receipt_url is not null;
drop policy if exists receipts_select_shared on storage.objects;
create policy receipts_select_shared on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.transactions t
      where t.receipt_url = objects.name and public.is_workspace_member(t.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: changes reach the other members' devices (RLS still applies).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'transactions', 'wallets_accounts', 'categories', 'debts', 'debt_repayments',
    'notifications', 'workspace_members', 'budgets'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
