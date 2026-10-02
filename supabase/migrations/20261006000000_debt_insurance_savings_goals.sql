-- Loan insurance on debts, and savings goals. Idempotent.

-- ---------------------------------------------------------------------------
-- Debts: optional loan insurance (e.g. credit life required by the bank).
-- ---------------------------------------------------------------------------
alter table public.debts add column if not exists insured boolean not null default false;
alter table public.debts add column if not exists insurer text;
alter table public.debts add column if not exists insurance_policy_no text;
alter table public.debts add column if not exists insurance_premium numeric(18, 2);
alter table public.debts add column if not exists insurance_currency public.currency_code;
alter table public.debts add column if not exists insurance_renewal_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'debts_insurance_check') then
    alter table public.debts add constraint debts_insurance_check
      check (
        (insurer is null or char_length(insurer) <= 60)
        and (insurance_policy_no is null or char_length(insurance_policy_no) <= 60)
        and (insurance_premium is null or insurance_premium >= 0)
      );
  end if;
end $$;

grant update (insured, insurer, insurance_policy_no, insurance_premium, insurance_currency, insurance_renewal_date)
  on public.debts to authenticated;

-- ---------------------------------------------------------------------------
-- Savings goals: a goal is a savings pot (a wallet with a target). Money gets
-- in and out only by transfers from/to the user's other wallets, so net worth
-- never changes when saving; a goal starts empty.
-- ---------------------------------------------------------------------------
alter table public.wallets_accounts add column if not exists goal_target numeric(18, 2);
alter table public.wallets_accounts add column if not exists goal_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_goal_target_check') then
    alter table public.wallets_accounts add constraint wallets_goal_target_check
      check (goal_target is null or goal_target > 0);
  end if;
end $$;

create index if not exists wallets_accounts_goals_idx on public.wallets_accounts (workspace_id) where goal_target is not null;

grant update (goal_target, goal_date) on public.wallets_accounts to authenticated;

create or replace function public.guard_goal_wallet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('luysmart.import', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.goal_target is not null and new.balance <> 0 then
      raise exception 'goal_starts_empty' using errcode = 'P0001';
    end if;
  elsif (old.goal_target is null) <> (new.goal_target is null) then
    -- A wallet can't become a goal (or back): its history would stop adding up.
    raise exception 'goal_kind_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists wallets_accounts_goal_guard on public.wallets_accounts;
create trigger wallets_accounts_goal_guard
  before insert or update of goal_target on public.wallets_accounts
  for each row execute function public.guard_goal_wallet();

-- Income and expenses can't be booked on a goal: only transfers move money in or out.
create or replace function public.guard_goal_transactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'TRANSFER'
     and exists (select 1 from public.wallets_accounts w where w.id = new.wallet_id and w.goal_target is not null) then
    raise exception 'goal_transfers_only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_goal_guard on public.transactions;
create trigger transactions_goal_guard
  before insert or update of type, wallet_id on public.transactions
  for each row execute function public.guard_goal_transactions();

-- The plan's wallet limit doesn't count savings goals.
create or replace function public.guard_wallet_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  max_wallets integer;
  used integer;
begin
  if (select auth.uid()) is null or coalesce(current_setting('luysmart.import', true), '') = 'on' then
    return new;
  end if;
  -- Only creating a wallet or bringing one back from the archive counts.
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null) then
    return new;
  end if;
  if new.archived_at is not null or new.goal_target is not null then
    return new;
  end if;
  select user_id into owner from public.workspaces where id = new.workspace_id;
  max_wallets := (public.plan_of(owner)).max_wallets;
  if max_wallets is null then
    return new;
  end if;
  select count(*) into used
  from public.wallets_accounts w join public.workspaces ws on ws.id = w.workspace_id
  where ws.user_id = owner and w.archived_at is null and w.goal_target is null and w.id <> new.id;
  if used >= max_wallets then
    raise exception 'plan_limit:wallets' using errcode = 'P0001', hint = max_wallets::text;
  end if;
  return new;
end;
$$;
