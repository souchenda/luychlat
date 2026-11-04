-- «💰 ប្រាក់ខែចូលហើយ — ផ្ទេរ … ទៅគោលដៅ … ទេ?» (founder, 4/11/2026 — Personal, src/lib/salary-saving.ts): when a salary is
-- recorded through the bot, the goal that still needs money this month is offered with [✅ ផ្ទេរ] [ពេលក្រោយ]. The amount is
-- computed by the server (lib/salary-saving.ts) from what this returns; the transfer is made only on the person's tap, checked
-- again then, as an ordinary transfer (the same row the app's transfer sheet writes). A PERSONAL workspace only. Additive.

create table if not exists public.savings_nudges (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  income_tx    uuid not null unique references public.transactions (id) on delete cascade,
  from_wallet  uuid not null,
  goal_wallet  uuid not null,
  from_amount  numeric(18, 2) not null check (from_amount > 0),
  to_amount    numeric(18, 2) not null check (to_amount > 0),
  rate         numeric,
  status       text not null default 'OPEN' check (status in ('OPEN', 'DONE', 'LATER', 'FAILED')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
alter table public.savings_nudges enable row level security;
revoke all on public.savings_nudges from anon, authenticated;

-- The salary just saved and the workspace's goals: balance, target, date, and what went into each this (Cambodian) month.
create or replace function public.bot_salary_goal_data(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  t record;
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'none');
  end if;
  select tx.id, tx.workspace_id, tx.wallet_id, tx.amount, tx.currency, coalesce(w.khr_per_usd, 4000) as rate
  into t
  from public.transactions tx
  join public.categories c on c.id = tx.category_id
  join public.workspaces w on w.id = tx.workspace_id
  where tx.id = p_tx_id and tx.type = 'INCOME' and c.preset_key = 'salary' and w.type = 'PERSONAL'
    and exists (select 1 from public.workspace_members m where m.workspace_id = tx.workspace_id and m.user_id = link.uid);
  if t.id is null then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'wallet_id', t.wallet_id, 'amount', t.amount, 'currency', t.currency, 'rate', t.rate,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'currency', g.currency, 'balance', g.balance, 'target', g.goal_target, 'date', g.goal_date,
        'saved_month', coalesce((
          select sum(x.to_amount) from public.transactions x
          where x.to_wallet_id = g.id and x.type = 'TRANSFER' and x.transaction_date >= v_month
        ), 0)))
      from public.wallets_accounts g
      where g.workspace_id = t.workspace_id and g.goal_target is not null and g.archived_at is null and g.id <> t.wallet_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The one offer for this salary (amounts computed by the server).
create or replace function public.bot_salary_goal_offer(p_key text, p_tx_id uuid, p_goal uuid, p_from numeric, p_to numeric, p_rate numeric)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public.require_bot(p_key);
  insert into public.savings_nudges (workspace_id, income_tx, from_wallet, goal_wallet, from_amount, to_amount, rate)
  select tx.workspace_id, tx.id, tx.wallet_id, g.id, p_from, p_to, p_rate
  from public.transactions tx
  join public.wallets_accounts g on g.id = p_goal and g.workspace_id = tx.workspace_id and g.goal_target is not null
  where tx.id = p_tx_id and tx.type = 'INCOME'
  on conflict (income_tx) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- The tap. ✅: a member of the workspace, still open, the goal still a goal → the transfer, as the app writes it.
-- «ពេលក្រោយ»: closed, nothing moves.
create or replace function public.bot_salary_goal_transfer(p_key text, p_chat_id bigint, p_id bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  s public.savings_nudges;
  f public.wallets_accounts;
  g public.wallets_accounts;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into s from public.savings_nudges where id = p_id for update;
  if s.id is null or not exists (select 1 from public.workspace_members m where m.workspace_id = s.workspace_id and m.user_id = link.uid) then
    return jsonb_build_object('status', 'gone');
  end if;
  if s.status <> 'OPEN' then
    return jsonb_build_object('status', 'already');
  end if;
  if not p_accept then
    update public.savings_nudges set status = 'LATER', decided_at = now() where id = s.id;
    return jsonb_build_object('status', 'later');
  end if;
  select * into f from public.wallets_accounts where id = s.from_wallet and workspace_id = s.workspace_id and archived_at is null;
  select * into g from public.wallets_accounts where id = s.goal_wallet and workspace_id = s.workspace_id and goal_target is not null and archived_at is null;
  if f.id is null or g.id is null then
    update public.savings_nudges set status = 'FAILED', decided_at = now() where id = s.id;
    return jsonb_build_object('status', 'gone');
  end if;
  perform public.bot_act_as(link.uid);
  begin
    insert into public.transactions (workspace_id, wallet_id, to_wallet_id, amount, to_amount, exchange_rate, currency, type, note, transaction_date)
    values (s.workspace_id, f.id, g.id, s.from_amount, s.to_amount, case when f.currency = g.currency then null else s.rate end, f.currency, 'TRANSFER',
            left('សន្សំ · ' || g.name, 500), now());
  exception when others then
    update public.savings_nudges set status = 'FAILED', decided_at = now() where id = s.id;
    return jsonb_build_object('status', 'failed', 'reason', left(sqlerrm, 120));
  end;
  update public.savings_nudges set status = 'DONE', decided_at = now() where id = s.id;
  select * into g from public.wallets_accounts where id = s.goal_wallet;
  return jsonb_build_object('status', 'done', 'goal', g.name, 'to_amount', s.to_amount, 'currency', g.currency,
    'percent', case when g.goal_target > 0 then least(100, round(g.balance / g.goal_target * 100)) else null end);
end;
$$;

revoke all on function public.bot_salary_goal_data(text, bigint, uuid) from public;
revoke all on function public.bot_salary_goal_offer(text, uuid, uuid, numeric, numeric, numeric) from public;
revoke all on function public.bot_salary_goal_transfer(text, bigint, bigint, boolean) from public;
grant execute on function public.bot_salary_goal_data(text, bigint, uuid) to anon, authenticated;
grant execute on function public.bot_salary_goal_offer(text, uuid, uuid, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.bot_salary_goal_transfer(text, bigint, bigint, boolean) to anon, authenticated;

select public.apply_security_gate();
