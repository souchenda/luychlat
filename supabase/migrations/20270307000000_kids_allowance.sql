-- «ប្រាក់ហោប៉ៅកូន» — children's pocket money (founder, 9/11/2026). A child's money is a savings goal wallet («👶»,
-- goal_kids) with what the child saves for as its target; its allowance is a weekly amount, a day of the week and the
-- parent's wallet it comes from. Nothing moves by itself: on the day, Home asks [ផ្ដល់] and that one tap makes an
-- ordinary transfer (the app's own) and notes the day here (given_on), so it is asked once a week, never twice.
--
-- Keyed by the child's wallet (it follows the wallet if the wallet moves; deleted with it). Access is the wallet's own:
-- a family member who may see the wallet sees its allowance; one who may write it may change it.

create table if not exists public.allowances (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null unique references public.wallets_accounts (id) on delete cascade,
  from_wallet_id uuid references public.wallets_accounts (id) on delete set null,
  amount         numeric(14, 2) not null check (amount > 0 and amount < 1e9),
  -- 0 Sunday … 6 Saturday (JavaScript's getDay).
  weekday        smallint not null check (weekday between 0 and 6),
  given_on       date,
  created_by     uuid references auth.users (id) on delete set null default (auth.uid()),
  created_at     timestamptz not null default now()
);
alter table public.allowances enable row level security;
revoke all on public.allowances from anon;
grant select, insert, update, delete on public.allowances to authenticated;

create or replace function public.allowance_wallet_access(p_wallet uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wallets_accounts w
    where w.id = p_wallet
      and case when p_write
               then public.can_write_workspace(w.workspace_id) and (w.visibility = 'SHARED' or w.owner_id = (select auth.uid()))
               else public.is_workspace_member(w.workspace_id) and (w.visibility = 'SHARED' or w.owner_id = (select auth.uid()))
          end
  );
$$;
revoke all on function public.allowance_wallet_access(uuid, boolean) from public, anon;
grant execute on function public.allowance_wallet_access(uuid, boolean) to authenticated;

drop policy if exists allowances_select on public.allowances;
create policy allowances_select on public.allowances
  for select to authenticated using (public.allowance_wallet_access(wallet_id, false));
drop policy if exists allowances_insert on public.allowances;
create policy allowances_insert on public.allowances
  for insert to authenticated
  with check (public.allowance_wallet_access(wallet_id, true)
              and (from_wallet_id is null or public.allowance_wallet_access(from_wallet_id, true)));
drop policy if exists allowances_update on public.allowances;
create policy allowances_update on public.allowances
  for update to authenticated
  using (public.allowance_wallet_access(wallet_id, true))
  with check (public.allowance_wallet_access(wallet_id, true)
              and (from_wallet_id is null or public.allowance_wallet_access(from_wallet_id, true)));
drop policy if exists allowances_delete on public.allowances;
create policy allowances_delete on public.allowances
  for delete to authenticated using (public.allowance_wallet_access(wallet_id, true));
