-- Shared pools: edit a share (name and amount), remove a member — refunding what
-- they paid — and a target that always follows the shares.
-- (9 families planned, 4 dropped out: the pool showed ៥/៩ and "$400 left" forever.)

-- The target is the sum of the shares, whenever the pool has shares at all
-- (a pool without set shares — a trip with a budget — keeps its own target).
create or replace function public.pool_sync_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := coalesce(new.pool_id, old.pool_id);
  total numeric;
begin
  select coalesce(sum(m.pledged), 0) into total from public.pool_members m where m.pool_id = pid;
  if total > 0 then
    update public.pools set target_budget = total where id = pid and target_budget is distinct from total;
  end if;
  return null;
end;
$$;
drop trigger if exists pool_members_sync_target on public.pool_members;
create trigger pool_members_sync_target after insert or delete or update of pledged on public.pool_members
  for each row execute function public.pool_sync_target();

-- App: a member's name and share amount.
create or replace function public.pool_member_update(p_member_id uuid, p_name text, p_pledged numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.pool_members;
  p public.pools;
  clean text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
begin
  select * into m from public.pool_members where id = p_member_id;
  select * into p from public.pools where id = m.pool_id;
  if m.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.status <> 'active' then raise exception 'pool_closed' using errcode = 'P0001'; end if;
  if char_length(clean) < 1 or p_pledged is null or p_pledged < 0 or p_pledged >= 1e12 then
    raise exception 'invalid member' using errcode = '22023';
  end if;
  update public.pool_members set name = clean, pledged = round(p_pledged, 2) where id = m.id;
end;
$$;

-- App: remove a member. Someone who already paid is refunded from the pool (an
-- explicit "↩️ ប្រគល់ប្រាក់វិញ" expense — the history keeps both the payment and the
-- refund); without p_refund the call only reports what they paid.
create or replace function public.pool_member_remove(p_member_id uuid, p_refund boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.pool_members;
  p public.pools;
  w public.wallets_accounts;
  paid numeric;
  category_id uuid;
begin
  select * into m from public.pool_members where id = p_member_id;
  select * into p from public.pools where id = m.pool_id;
  if m.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.status <> 'active' then raise exception 'pool_closed' using errcode = 'P0001'; end if;
  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(sum(t.amount), 0) into paid
  from public.pool_contributions c join public.transactions t on t.id = c.transaction_id
  where c.member_id = m.id and t.type = 'INCOME';
  if paid > 0 and not coalesce(p_refund, false) then
    return jsonb_build_object('status', 'paid', 'paid', paid, 'currency', w.currency);
  end if;
  if paid > 0 then
    category_id := public.ensure_preset_category(p.workspace_id, 'pool_refund', 'EXPENSE', 'hand-coins', '#64748b', 'ប្រគល់ប្រាក់វិញ');
    -- Fails with insufficient_balance when the pool no longer holds that much.
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note)
    values (p.workspace_id, w.id, category_id, paid, w.currency, 'EXPENSE', left('↩️ ប្រគល់ប្រាក់វិញ · ' || m.name, 500));
  end if;
  delete from public.pool_members where id = m.id;
  return jsonb_build_object('status', 'ok', 'refunded', paid, 'currency', w.currency);
end;
$$;

revoke all on function public.pool_member_update(uuid, text, numeric) from public, anon;
grant execute on function public.pool_member_update(uuid, text, numeric) to authenticated;
revoke all on function public.pool_member_remove(uuid, boolean) from public, anon;
grant execute on function public.pool_member_remove(uuid, boolean) to authenticated;

-- Pools whose target drifted from their shares (members added or removed before this).
update public.pools p set target_budget = s.total
from (select pool_id, sum(pledged) total from public.pool_members group by pool_id) s
where s.pool_id = p.id and s.total > 0 and p.status = 'active' and p.target_budget is distinct from s.total;

select public.apply_security_gate();
