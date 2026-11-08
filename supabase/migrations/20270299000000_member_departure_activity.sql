-- What a member did before leaving (founder, 8/11/2026: «យ៉ាងហោចណាស់ខ្ញុំត្រូវដឹងថាគេចូលមកបានធ្វើអីខ្លះលើអេប» — «មានដំណឹងតែ
-- ពេលចូល ពេលគេចេញវិញស្ងាត់ឈឹងចឹងមិនត្រូវទេ»). The departure card (20270298000000) now carries the member's use of the
-- app — COUNTS and dates only, never an amount or a balance (bot privacy, CLAUDE.md): workspaces, wallets, entries (first /
-- last), loans, budgets, bills, Telegram linked, Islamic Mode, the plan, last active. Taken BEFORE the data goes:
-- delete_my_account removes the ledger before the sign-in, so it records first; the auth.users trigger records only an
-- account not recorded in this transaction (one removed from the dashboard). Additive.

alter table public.member_departures add column if not exists activity jsonb;

create or replace function public.record_member_departure(p_uid uuid, p_self boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u auth.users;
  act jsonb;
  ws uuid[];
begin
  begin
    if exists (select 1 from public.member_departures d where d.user_id = p_uid and d.deleted_at = now()) then return; end if;
    select * into u from auth.users where id = p_uid;
    select coalesce(array_agg(w.id), '{}') into ws from public.workspaces w where w.user_id = p_uid;
    begin
      act := jsonb_build_object(
        'workspaces', cardinality(ws),
        'shared_in', (select count(*) from public.workspace_members m where m.user_id = p_uid and not (m.workspace_id = any(ws))),
        'wallets', (select count(*) from public.wallets_accounts a where a.workspace_id = any(ws)),
        'entries', (select count(*) from public.transactions t where t.workspace_id = any(ws)),
        'first_entry', (select min(t.created_at) from public.transactions t where t.workspace_id = any(ws)),
        'last_entry', (select max(t.created_at) from public.transactions t where t.workspace_id = any(ws)),
        'debts', (select count(*) from public.debts d where d.workspace_id = any(ws)),
        'budgets', (select count(*) from public.budgets b where b.workspace_id = any(ws)),
        'bills', (select count(*) from public.recurring_bills r where r.workspace_id = any(ws)),
        'telegram', exists (select 1 from public.telegram_links l where l.user_id = p_uid),
        'islamic', coalesce((select s.enabled from public.islamic_settings s where s.user_id = p_uid), false),
        'tier', (select case when s.status = 'ACTIVE' and s.current_period_end > now() then (case when s.plan_code like 'ULTRA%' then 'ULTRA' else 'PRO' end) else 'FREE' end
                   from public.subscriptions s where s.user_id = p_uid),
        'last_active', public.last_active_at(p_uid));
    exception when others then
      act := null; -- the card still goes, without the activity
    end;
    insert into public.member_departures (user_id, email, display_name, joined_at, self_deleted, activity)
    values (p_uid, u.email::text, (select pr.display_name from public.profiles pr where pr.id = p_uid), u.created_at, p_self, act);
  exception when others then
    null; -- never blocks or fails a delete
  end;
end;
$$;
revoke all on function public.record_member_departure(uuid, boolean) from public, anon, authenticated;

create or replace function public.queue_member_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_member_departure(old.id, (select auth.uid()) is not distinct from old.id);
  return old;
end;
$$;

-- The same function as 20261202000000, recording the member's use first (its ledger is deleted below).
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fresh boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'confirm_required' using errcode = '22023';
  end if;
  -- Staff accounts are removed from the staff list first (by a super admin).
  if public.is_staff_user(uid) then
    raise exception 'staff_account' using errcode = '42501';
  end if;
  -- The password (or a one-time code) entered within the last 5 minutes.
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300
  ) into fresh;
  if not fresh then
    raise exception 'reauth_required' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  -- A family workspace with other members would vanish for them too.
  if exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id and m.user_id <> uid
    where w.user_id = uid
  ) then
    raise exception 'shared_workspaces' using errcode = '22023';
  end if;

  perform public.audit('ACCOUNT_SELF_DELETED', null, null, null, uid);
  -- The founder is told who left and what they used (counts only — founder, 8/11/2026), before the data goes.
  perform public.record_member_departure(uid, true);
  -- In an order the foreign keys accept: repayments point at wallets without a
  -- cascade, so they go first, then the ledger, then the workspaces (which
  -- cascade to wallets, debts, budgets…), then the sign-in itself.
  delete from public.debt_repayments r using public.debts d, public.workspaces w
  where r.debt_id = d.id and d.workspace_id = w.id and w.user_id = uid;
  delete from public.transactions t using public.workspaces w where t.workspace_id = w.id and w.user_id = uid;
  delete from public.workspaces where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

drop function if exists public.bot_departure_alerts_pending(text);
create function public.bot_departure_alerts_pending(p_key text)
returns table(id bigint, email text, display_name text, joined_at timestamptz, self_deleted boolean, deleted_at timestamptz, total_members bigint, activity jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select d.id, d.email, d.display_name, d.joined_at, d.self_deleted, d.deleted_at, (select count(*) from auth.users), d.activity
    from public.member_departures d
    where d.sent_at is null and d.deleted_at > now() - interval '2 days'
    order by d.deleted_at
    limit 20;
end;
$$;
revoke all on function public.bot_departure_alerts_pending(text) from public, anon, authenticated;
grant execute on function public.bot_departure_alerts_pending(text) to anon, authenticated;
