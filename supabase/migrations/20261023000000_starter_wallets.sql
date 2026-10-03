-- New accounts start with two wallets, so the first expense (in the app or
-- "កាហ្វេ 2$" to the bot) has somewhere to go: "សាច់ប្រាក់" (Cash) and
-- "កុងធនាគារ" (Bank account), in the workspace's default currency, at 0.
--
-- Only the Personal workspace gets them. They are extra: starter wallets don't
-- count toward the Free plan's wallet limit (decided 2026-10-03), so a Free
-- user still has their own slots, e.g. for the Business trial. Users rename
-- them freely (e.g. "ABA"); only the server sets is_starter. Runs once, when
-- the workspace is created, and never when it already has wallets; existing
-- accounts are not touched.

alter table public.wallets_accounts add column if not exists is_starter boolean not null default false;

create or replace function public.seed_starter_wallets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'PERSONAL' and not exists (select 1 from public.wallets_accounts w where w.workspace_id = new.id) then
    insert into public.wallets_accounts (workspace_id, name, balance, currency, icon, sort_order, visibility, owner_id, is_starter)
    values
      (new.id, 'សាច់ប្រាក់', 0, new.currency_default, 'cash', 0, 'SHARED', new.user_id, true),
      (new.id, 'កុងធនាគារ', 0, new.currency_default, 'other', 1, 'SHARED', new.user_id, true);
  end if;
  return new;
end;
$$;
revoke all on function public.seed_starter_wallets() from public, anon, authenticated;

drop trigger if exists workspaces_starter_wallets on public.workspaces;
create trigger workspaces_starter_wallets
  after insert on public.workspaces
  for each row execute function public.seed_starter_wallets();

-- The wallet limit, as before, but starter wallets don't use a slot.
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
  if new.archived_at is not null or new.goal_target is not null or new.is_starter then
    return new;
  end if;
  select user_id into owner from public.workspaces where id = new.workspace_id;
  max_wallets := (public.plan_of(owner)).max_wallets;
  if max_wallets is null then
    return new;
  end if;
  select count(*) into used
  from public.wallets_accounts w join public.workspaces ws on ws.id = w.workspace_id
  where ws.user_id = owner and w.archived_at is null and w.goal_target is null and not w.is_starter and w.id <> new.id;
  if used >= max_wallets then
    raise exception 'plan_limit:wallets' using errcode = 'P0001', hint = max_wallets::text;
  end if;
  return new;
end;
$$;
