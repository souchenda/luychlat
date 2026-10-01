-- Phase 2: wallet ordering/archiving, cross-currency transfers, balance trigger.

-- ---------------------------------------------------------------------------
-- wallets_accounts: ordering + archive
-- `icon` (guideline §3.2) stores the provider preset key: aba, acleda, wing,
-- canadia, truemoney, cash, other. `color` overrides the preset colour.
-- ---------------------------------------------------------------------------
alter table public.wallets_accounts
  add column sort_order  integer not null default 0,
  add column archived_at timestamptz,
  add column color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

create index wallets_accounts_workspace_sort_idx on public.wallets_accounts (workspace_id, sort_order);

-- A wallet's currency is fixed once it has transactions (amounts would no
-- longer match the wallet).
create or replace function public.guard_wallet_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and exists (
    select 1 from public.transactions t where t.wallet_id = old.id or t.to_wallet_id = old.id
  ) then
    raise exception 'cannot change currency of a wallet with transactions' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger wallets_accounts_currency_guard
  before update of currency on public.wallets_accounts
  for each row execute function public.guard_wallet_currency();

-- ---------------------------------------------------------------------------
-- transactions: destination amount for TRANSFER
-- `amount` is in the source wallet's currency, `to_amount` in the destination
-- wallet's currency. For cross-currency transfers `exchange_rate` is the rate
-- used, always expressed as KHR per 1 USD (e.g. 4100), whichever direction.
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column to_amount numeric(18, 2) check (to_amount is null or to_amount > 0),
  add constraint transactions_transfer_to_amount check ((type = 'TRANSFER') = (to_amount is not null));

-- A wallet with history must be archived, not deleted: deleting it would
-- silently rewrite the counterpart wallet's balance. NO ACTION (checked at end
-- of statement) still lets a whole workspace/user cascade-delete cleanly.
alter table public.transactions
  drop constraint transactions_wallet_id_workspace_id_fkey,
  drop constraint transactions_to_wallet_id_workspace_id_fkey,
  add constraint transactions_wallet_id_workspace_id_fkey
    foreign key (wallet_id, workspace_id) references public.wallets_accounts (id, workspace_id) on delete no action,
  add constraint transactions_to_wallet_id_workspace_id_fkey
    foreign key (to_wallet_id, workspace_id) references public.wallets_accounts (id, workspace_id) on delete no action;

alter table public.debt_repayments
  drop constraint debt_repayments_wallet_id_fkey,
  add constraint debt_repayments_wallet_id_fkey
    foreign key (wallet_id) references public.wallets_accounts (id) on delete no action;

-- ---------------------------------------------------------------------------
-- Balance maintenance: wallets_accounts.balance always reflects transactions.
-- Runs as the caller, so the wallet updates are subject to RLS as well.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_wallet_balances(t public.transactions, direction integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  source_currency public.currency_code;
  target_currency public.currency_code;
begin
  if direction > 0 then
    select currency into source_currency from public.wallets_accounts where id = t.wallet_id;
    if source_currency is distinct from t.currency then
      raise exception 'transaction currency % does not match wallet currency %', t.currency, source_currency
        using errcode = '22023';
    end if;
  end if;

  if t.type = 'INCOME' then
    update public.wallets_accounts set balance = balance + direction * t.amount where id = t.wallet_id;
  elsif t.type = 'EXPENSE' then
    update public.wallets_accounts set balance = balance - direction * t.amount where id = t.wallet_id;
  else
    if direction > 0 then
      select currency into target_currency from public.wallets_accounts where id = t.to_wallet_id;
      if target_currency is distinct from t.currency and t.exchange_rate is null then
        raise exception 'cross-currency transfer requires exchange_rate' using errcode = '22023';
      end if;
    end if;
    update public.wallets_accounts set balance = balance - direction * t.amount where id = t.wallet_id;
    update public.wallets_accounts set balance = balance + direction * t.to_amount where id = t.to_wallet_id;
    -- Transfers may not overdraw the source wallet.
    if direction > 0 and exists (
      select 1 from public.wallets_accounts where id = t.wallet_id and balance < 0
    ) then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

create or replace function public.on_transaction_change()
returns trigger
language plpgsql
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

create trigger transactions_balance
  after insert or update or delete on public.transactions
  for each row execute function public.on_transaction_change();
