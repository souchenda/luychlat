-- ===========================================================================
-- Bank reconciliation (PRO): import a bank statement into a wallet, match its
-- lines to the ledger, add what's missing and align the balance.
--
-- The statement file never reaches the server: the app parses it on the
-- device and sends only normalized lines (date, signed amount, description,
-- bank reference, running balance) plus a SHA-256 of the file.
-- import_statement() validates every decision and applies them atomically.
-- Idempotent: safe to re-run.
-- ===========================================================================

alter table public.transactions
  add column if not exists reconciled_at timestamptz,
  add column if not exists bank_ref text;
alter table public.transactions
  drop constraint if exists transactions_bank_ref_length,
  add constraint transactions_bank_ref_length check (bank_ref is null or char_length(bank_ref) <= 80);

alter table public.wallets_accounts
  add column if not exists last_reconciled_on date,
  add column if not exists last_reconciled_balance numeric(18, 2);

create table if not exists public.statement_imports (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  wallet_id       uuid not null,
  created_by      uuid references auth.users (id) on delete set null,
  bank            text not null check (bank ~ '^[A-Z_]{2,20}$'),
  source_format   text not null check (source_format in ('CSV', 'XLSX', 'PDF')),
  file_sha256     text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  currency        public.currency_code not null,
  period_start    date not null,
  period_end      date not null,
  opening_balance numeric(18, 2),
  closing_balance numeric(18, 2),
  line_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  check (period_end >= period_start),
  foreign key (wallet_id, workspace_id) references public.wallets_accounts (id, workspace_id) on delete cascade,
  unique (wallet_id, file_sha256)
);
create index if not exists statement_imports_wallet_idx on public.statement_imports (wallet_id, created_at desc);

create table if not exists public.statement_lines (
  id              uuid primary key default gen_random_uuid(),
  import_id       uuid not null references public.statement_imports (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  wallet_id       uuid not null,
  line_no         integer not null check (line_no > 0),
  posted_on       date not null,
  amount          numeric(18, 2) not null check (amount <> 0),
  description     text check (description is null or char_length(description) <= 300),
  bank_ref        text check (bank_ref is null or char_length(bank_ref) <= 80),
  running_balance numeric(18, 2),
  fingerprint     text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  status          text not null default 'UNMATCHED' check (status in ('UNMATCHED', 'MATCHED', 'CREATED', 'IGNORED')),
  transaction_id  uuid unique references public.transactions (id) on delete set null,
  match_score     smallint check (match_score is null or match_score between 0 and 100),
  foreign key (wallet_id, workspace_id) references public.wallets_accounts (id, workspace_id) on delete cascade,
  -- A line already imported from an overlapping statement is skipped.
  unique (wallet_id, fingerprint)
);
create index if not exists statement_lines_import_idx on public.statement_lines (import_id, line_no);

-- Read-only for members; every write goes through the functions below.
alter table public.statement_imports enable row level security;
alter table public.statement_lines enable row level security;
drop policy if exists statement_imports_select on public.statement_imports;
create policy statement_imports_select on public.statement_imports
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists statement_lines_select on public.statement_lines;
create policy statement_lines_select on public.statement_lines
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- How much a ledger row moves one wallet, in that wallet's currency
-- (the same arithmetic as adjust_wallet_balances).
-- ---------------------------------------------------------------------------
create or replace function public.wallet_effect(t public.transactions, p_wallet_id uuid, p_wallet_currency public.currency_code)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when t.type = 'TRANSFER' and t.wallet_id = p_wallet_id then -t.amount
    when t.type = 'TRANSFER' and t.to_wallet_id = p_wallet_id then t.to_amount
    when t.wallet_id <> p_wallet_id then 0
    when t.type = 'INCOME' then public.amount_in_wallet_currency(t.amount, t.currency, t.exchange_rate, p_wallet_currency)
    else -public.amount_in_wallet_currency(t.amount, t.currency, t.exchange_rate, p_wallet_currency)
  end;
$$;

-- ---------------------------------------------------------------------------
-- A ✓ never goes stale: changing the money of a reconciled row (or deleting
-- it) puts its statement line back to "unmatched".
-- ---------------------------------------------------------------------------
create or replace function public.unreconcile_changed_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.statement_lines set status = 'UNMATCHED', transaction_id = null, match_score = null
    where transaction_id = old.id;
    return old;
  end if;
  if old.reconciled_at is not null and (
    new.amount is distinct from old.amount or new.currency is distinct from old.currency
    or new.exchange_rate is distinct from old.exchange_rate or new.type is distinct from old.type
    or new.wallet_id is distinct from old.wallet_id or new.to_wallet_id is distinct from old.to_wallet_id
    or new.to_amount is distinct from old.to_amount
  ) then
    new.reconciled_at := null;
    update public.statement_lines set status = 'UNMATCHED', transaction_id = null, match_score = null
    where transaction_id = old.id;
  end if;
  return new;
end;
$$;
create or replace trigger transactions_unreconcile_on_change
  before update on public.transactions
  for each row execute function public.unreconcile_changed_transaction();
create or replace trigger transactions_unreconcile_on_delete
  before delete on public.transactions
  for each row execute function public.unreconcile_changed_transaction();

-- Caller may write to the wallet (member/owner; personal wallets: owner only).
create or replace function public.require_wallet_writer(p_wallet_id uuid)
returns public.wallets_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets_accounts;
begin
  select * into w from public.wallets_accounts where id = p_wallet_id;
  if not found or not public.can_write_workspace(w.workspace_id)
     or (w.visibility = 'PERSONAL' and w.owner_id is distinct from (select auth.uid())) then
    raise exception 'wallet not found' using errcode = '42501';
  end if;
  return w;
end;
$$;

-- Lines of these fingerprints that this wallet already has (preview only).
create or replace function public.statement_known_fingerprints(p_wallet_id uuid, p_fingerprints text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_wallet_writer(p_wallet_id);
  if coalesce(array_length(p_fingerprints, 1), 0) > 5000 then
    raise exception 'too many lines' using errcode = '22023';
  end if;
  return coalesce((
    select array_agg(l.fingerprint) from public.statement_lines l
    where l.wallet_id = p_wallet_id and l.fingerprint = any (p_fingerprints)
  ), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- import_statement(wallet, meta, lines, align)
--   meta:  {bank, source_format, file_sha256, period_start, period_end,
--           opening_balance?, closing_balance?}
--   lines: [{line_no, posted_on, amount (signed), description?, bank_ref?,
--            running_balance?, fingerprint, action, transaction_id?,
--            category_id?, note?, fee?, score?}]
--   action: match (link transaction_id) | create (add to the ledger) |
--           ignore | none (leave for later)
--   align: add one adjustment so the wallet equals closing_balance as of
--          period_end (Phnom Penh time).
-- ---------------------------------------------------------------------------
create or replace function public.import_statement(p_wallet_id uuid, p_meta jsonb, p_lines jsonb, p_align boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  w public.wallets_accounts;
  imp public.statement_imports;
  l jsonb;
  line_id uuid;
  t public.transactions;
  action text;
  amount numeric;
  category uuid;
  inserted integer := 0;
  skipped integer := 0;
  matched integer := 0;
  created integer := 0;
  as_of timestamptz;
  balance_as_of numeric;
  diff numeric := 0;
  adjusted numeric := 0;
  adj_category uuid;
  scale integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  perform public.require_wallet_writer(p_wallet_id);
  select * into w from public.wallets_accounts where id = p_wallet_id for update;
  scale := case when w.currency = 'KHR' then 0 else 2 end;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 3000 then
    raise exception 'statement must have 1 to 3000 lines' using errcode = '22023';
  end if;

  begin
    insert into public.statement_imports (
      workspace_id, wallet_id, created_by, bank, source_format, file_sha256, currency,
      period_start, period_end, opening_balance, closing_balance
    ) values (
      w.workspace_id, w.id, uid, upper(p_meta ->> 'bank'), upper(p_meta ->> 'source_format'), lower(p_meta ->> 'file_sha256'),
      w.currency, (p_meta ->> 'period_start')::date, (p_meta ->> 'period_end')::date,
      round((p_meta ->> 'opening_balance')::numeric, scale), round((p_meta ->> 'closing_balance')::numeric, scale)
    ) returning * into imp;
  exception when unique_violation then
    raise exception 'already_imported' using errcode = 'P0001';
  end;

  for l in select value from jsonb_array_elements(p_lines) loop
    amount := round((l ->> 'amount')::numeric, scale);
    if (l ->> 'posted_on')::date not between imp.period_start and imp.period_end then
      raise exception 'line % is outside the statement period', l ->> 'line_no' using errcode = '22023';
    end if;

    insert into public.statement_lines (
      import_id, workspace_id, wallet_id, line_no, posted_on, amount, description, bank_ref, running_balance, fingerprint
    ) values (
      imp.id, w.workspace_id, w.id, (l ->> 'line_no')::integer, (l ->> 'posted_on')::date, amount,
      left(nullif(btrim(l ->> 'description'), ''), 300), left(nullif(btrim(l ->> 'bank_ref'), ''), 80),
      round((l ->> 'running_balance')::numeric, scale), lower(l ->> 'fingerprint')
    )
    on conflict (wallet_id, fingerprint) do nothing
    returning id into line_id;
    if line_id is null then
      skipped := skipped + 1;
      continue;
    end if;
    inserted := inserted + 1;
    action := coalesce(l ->> 'action', 'none');

    if action = 'match' then
      select * into t from public.transactions
      where id = (l ->> 'transaction_id')::uuid and workspace_id = w.workspace_id
        and (wallet_id = w.id or to_wallet_id = w.id)
      for update;
      if not found or t.reconciled_at is not null then
        raise exception 'match_invalid: line %', l ->> 'line_no' using errcode = 'P0001';
      end if;
      if public.wallet_effect(t, w.id, w.currency) <> amount then
        raise exception 'match_amount: line %', l ->> 'line_no' using errcode = 'P0001';
      end if;
      begin
        update public.statement_lines
        set status = 'MATCHED', transaction_id = t.id, match_score = least(greatest((l ->> 'score')::integer, 0), 100)
        where id = line_id;
      exception when unique_violation then
        raise exception 'match_invalid: line %', l ->> 'line_no' using errcode = 'P0001';
      end;
      update public.transactions
      set reconciled_at = now(), bank_ref = coalesce(bank_ref, left(nullif(btrim(l ->> 'bank_ref'), ''), 80))
      where id = t.id;
      matched := matched + 1;

    elsif action = 'create' then
      category := nullif(l ->> 'category_id', '')::uuid;
      if category is not null and not exists (
        select 1 from public.categories c
        where c.id = category and c.workspace_id = w.workspace_id
          and c.type = case when amount > 0 then 'INCOME'::public.category_type else 'EXPENSE'::public.category_type end
      ) then
        category := null;
      end if;
      if category is null and amount < 0 and coalesce((l ->> 'fee')::boolean, false) then
        category := public.ensure_preset_category(w.workspace_id, 'bank_fee', 'EXPENSE', 'landmark', '#64748b', 'កម្រៃធនាគារ');
      end if;
      insert into public.transactions (
        workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, reconciled_at, bank_ref
      ) values (
        w.workspace_id, w.id, category, abs(amount), w.currency,
        case when amount > 0 then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
        left(coalesce(nullif(btrim(l ->> 'note'), ''), nullif(btrim(l ->> 'description'), '')), 500),
        ((l ->> 'posted_on')::date + time '12:00') at time zone 'Asia/Phnom_Penh',
        now(), left(nullif(btrim(l ->> 'bank_ref'), ''), 80)
      ) returning * into t;
      update public.statement_lines set status = 'CREATED', transaction_id = t.id where id = line_id;
      created := created + 1;

    elsif action = 'ignore' then
      update public.statement_lines set status = 'IGNORED' where id = line_id;
    elsif action <> 'none' then
      raise exception 'unknown action %', action using errcode = '22023';
    end if;
  end loop;

  update public.statement_imports set line_count = inserted where id = imp.id;

  -- Balance as of the end of the statement day = now minus everything after it.
  if imp.closing_balance is not null then
    as_of := ((imp.period_end + 1)::timestamp) at time zone 'Asia/Phnom_Penh';
    select w2.balance into balance_as_of from public.wallets_accounts w2 where w2.id = w.id;
    balance_as_of := balance_as_of - coalesce((
      select sum(public.wallet_effect(x, w.id, w.currency)) from public.transactions x
      where (x.wallet_id = w.id or x.to_wallet_id = w.id) and x.transaction_date >= as_of
    ), 0);
    diff := round(imp.closing_balance - balance_as_of, scale);

    if p_align and diff <> 0 then
      if diff > 0 then
        adj_category := public.ensure_preset_category(w.workspace_id, 'adjustment_in', 'INCOME', 'scale', '#64748b', 'កែតម្រូវសមតុល្យ (+)');
      else
        adj_category := public.ensure_preset_category(w.workspace_id, 'adjustment_out', 'EXPENSE', 'scale', '#64748b', 'កែតម្រូវសមតុល្យ (−)');
      end if;
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, reconciled_at)
      values (
        w.workspace_id, w.id, adj_category, abs(diff), w.currency,
        case when diff > 0 then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
        left(coalesce(nullif(btrim(p_meta ->> 'adjust_note'), ''), 'Bank statement ' || to_char(imp.period_end, 'DD/MM/YYYY')), 500),
        as_of - interval '1 second', now()
      );
      adjusted := diff;
      diff := 0;
    end if;

    if diff = 0 then
      update public.wallets_accounts
      set last_reconciled_on = greatest(coalesce(last_reconciled_on, imp.period_end), imp.period_end),
          last_reconciled_balance = case when last_reconciled_on > imp.period_end then last_reconciled_balance else imp.closing_balance end
      where id = w.id;
    end if;
  end if;

  return jsonb_build_object(
    'import_id', imp.id, 'inserted', inserted, 'skipped', skipped, 'matched', matched, 'created', created,
    'balance_as_of', balance_as_of, 'difference', diff, 'adjusted', adjusted, 'aligned', p_align and imp.closing_balance is not null
  );
end;
$$;

-- Undo an import: its lines go away and matched rows lose their ✓. Rows that
-- were added from it (and any adjustment) stay in the ledger as normal rows.
create or replace function public.delete_statement_import(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  imp public.statement_imports;
begin
  select * into imp from public.statement_imports where id = p_import_id;
  if not found then
    raise exception 'import not found' using errcode = 'P0002';
  end if;
  perform public.require_wallet_writer(imp.wallet_id);
  update public.transactions set reconciled_at = null
  where id in (select transaction_id from public.statement_lines where import_id = imp.id and transaction_id is not null);
  delete from public.statement_imports where id = imp.id;
end;
$$;

revoke all on function public.wallet_effect(public.transactions, uuid, public.currency_code) from public, anon, authenticated;
revoke all on function public.unreconcile_changed_transaction() from public, anon, authenticated;
revoke all on function public.require_wallet_writer(uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.statement_known_fingerprints(uuid, text[])',
    'public.import_statement(uuid, jsonb, jsonb, boolean)',
    'public.delete_statement_import(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
