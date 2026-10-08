-- A pool's target is a plan, never cash.
-- create_pool had p_record_paid ("already collected"), ticked by default in the app:
-- a new family pool (9 × $100) booked 9 contributions — $900 of income nobody paid,
-- in the owner's monthly income and net worth. Guardrails:
--   1. create_pool takes no record-paid / initial-balance input; the pool wallet opens at 0.
--   2. No contribution can be recorded in the same database transaction that created
--      its pool (a trigger) — so no future change to create_pool can bring it back.
--      Money in comes only from a real event afterwards: a matched bank slip, a KHQR
--      payment, or a member marked paid by hand.
-- (Pool wallets are kept out of personal income and net worth in the app.)

drop function if exists public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean, text, text);
create or replace function public.create_pool(
  p_workspace_id uuid, p_kind text, p_title text, p_currency public.currency_code, p_split text,
  p_members jsonb, p_target numeric default null, p_start date default null, p_end date default null,
  p_unit text default 'PERSON', p_template text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  wallet_id uuid;
  pool_id uuid;
  e jsonb;
  i integer := 0;
  pledged numeric;
  total numeric := 0;
begin
  if uid is null or not public.can_write_workspace(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.plan_code_of(uid) = 'FREE'
     and exists (select 1 from public.pools where created_by = uid and status = 'active') then
    raise exception 'plan_limit:pools' using errcode = 'P0001';
  end if;
  if coalesce(p_unit, 'PERSON') not in ('PERSON', 'FAMILY') or (p_template is not null and p_template not in ('pchumben')) then
    raise exception 'invalid option' using errcode = '22023';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 1 and 100 then
    raise exception 'members must be 1–100' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(p_members) loop
    pledged := coalesce((e ->> 'pledged')::numeric, 0);
    if char_length(btrim(coalesce(e ->> 'name', ''))) not between 1 and 60 or pledged < 0 then
      raise exception 'invalid member' using errcode = '22023';
    end if;
    total := total + pledged;
  end loop;
  if coalesce(p_target, total) <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  -- The pool's wallet always opens empty: the target is planning metadata only.
  perform set_config('luysmart.pool', 'on', true);
  insert into public.wallets_accounts (workspace_id, name, currency, balance, icon, visibility)
  values (p_workspace_id, left(btrim(p_title), 60), p_currency, 0, 'pool_' || lower(p_kind), 'SHARED')
  returning id into wallet_id;
  perform set_config('luysmart.pool', 'off', true);

  insert into public.pools (workspace_id, wallet_id, created_by, kind, title, split, target_budget, start_date, end_date, share_photos, unit, template)
  values (p_workspace_id, wallet_id, uid, p_kind, left(btrim(p_title), 80), p_split, coalesce(p_target, total), p_start, p_end, p_kind = 'CHARITY',
          coalesce(p_unit, 'PERSON'), p_template)
  returning id into pool_id;
  if p_template = 'pchumben' then
    perform public.pool_template_categories(p_workspace_id);
  end if;

  -- Shares (who is expected to pay what) — never a payment.
  for e in select * from jsonb_array_elements(p_members) loop
    i := i + 1;
    insert into public.pool_members (pool_id, name, pledged, sort)
    values (pool_id, left(btrim(e ->> 'name'), 60), coalesce((e ->> 'pledged')::numeric, 0), i);
  end loop;
  return pool_id;
end;
$$;
revoke all on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, text, text) from public, anon;
grant execute on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, text, text) to authenticated;

-- Guardrail 2: a contribution in the very transaction that created its pool is synthetic.
create or replace function public.guard_pool_contribution_at_creation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.pools p where p.id = new.pool_id and p.created_at = now()) then
    raise exception 'pool_target_not_cash: a pool cannot record contributions while it is being created' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists pool_contributions_not_at_creation on public.pool_contributions;
create trigger pool_contributions_not_at_creation before insert on public.pool_contributions
  for each row execute function public.guard_pool_contribution_at_creation();

select public.apply_security_gate();
