-- Closed businesses: archive (hidden, read-only, restorable) or delete
-- permanently. At least one active Business workspace always remains, and
-- archived ones don't count toward the plan's business allowance. Idempotent.

alter table public.workspaces add column if not exists archived_at timestamptz;

create or replace function public.workspace_plan_access(p_workspace_id uuid, out writable boolean, out reason text, out trial_ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workspaces;
  p public.plans;
  business_rank integer;
begin
  writable := true;
  select * into w from public.workspaces where id = p_workspace_id;
  if not found or w.type <> 'BUSINESS' then
    return;
  end if;
  if w.archived_at is not null then
    writable := false;
    reason := 'ARCHIVED';
    return;
  end if;
  p := public.plan_of(w.user_id);
  -- 1 = the owner's first active business workspace.
  select count(*) + 1 into business_rank
  from public.workspaces o
  where o.user_id = w.user_id and o.type = 'BUSINESS' and o.archived_at is null and (o.created_at, o.id) < (w.created_at, w.id);
  if p.max_business_workspaces is not null and business_rank > p.max_business_workspaces then
    writable := false;
    reason := 'PLAN_LIMIT';
    return;
  end if;
  if p.tier = 'FREE' then
    trial_ends_at := w.trial_started_at + make_interval(days => p.business_trial_days);
    if now() >= trial_ends_at then
      writable := false;
      reason := 'TRIAL_ENDED';
    end if;
  end if;
end;
$$;

create or replace function public.create_business_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.plans;
  owned integer;
  result public.workspaces;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  p := public.plan_of(uid);
  select count(*) into owned from public.workspaces where user_id = uid and type = 'BUSINESS' and archived_at is null;
  if p.max_business_workspaces is not null and owned >= p.max_business_workspaces then
    raise exception 'plan_limit:business' using errcode = 'P0001', hint = p.max_business_workspaces::text;
  end if;
  insert into public.workspaces (user_id, name, type)
  values (uid, coalesce(nullif(left(btrim(p_name), 60), ''), 'អាជីវកម្ម'), 'BUSINESS')
  returning * into result;
  perform public.seed_default_categories(result.id, 'BUSINESS');
  return result;
end;
$$;

-- Owner only; never the last active business.
create or replace function public.set_business_archived(p_workspace_id uuid, p_archived boolean)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result public.workspaces;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id and user_id = uid and type = 'BUSINESS') then
    raise exception 'only the owner can archive this business' using errcode = '42501';
  end if;
  if p_archived and not exists (
    select 1 from public.workspaces
    where user_id = uid and type = 'BUSINESS' and archived_at is null and id <> p_workspace_id
  ) then
    raise exception 'last_business' using errcode = 'P0001';
  end if;
  update public.workspaces set archived_at = case when p_archived then coalesce(archived_at, now()) end
  where id = p_workspace_id
  returning * into result;
  return result;
end;
$$;
revoke all on function public.set_business_archived(uuid, boolean) from public, anon;
grant execute on function public.set_business_archived(uuid, boolean) to authenticated;

-- Deletes a business and everything in it. Owner only; never the last active business.
create or replace function public.delete_business_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id and user_id = uid and type = 'BUSINESS') then
    raise exception 'only the owner can delete this business' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspaces
    where user_id = uid and type = 'BUSINESS' and archived_at is null and id <> p_workspace_id
  ) then
    raise exception 'last_business' using errcode = 'P0001';
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
revoke all on function public.delete_business_workspace(uuid) from public, anon;
grant execute on function public.delete_business_workspace(uuid) to authenticated;
