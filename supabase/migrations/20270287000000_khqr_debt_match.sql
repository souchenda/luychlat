-- KHQR payment ↔ customer debt (AR) (founder, 4/11/2026 — src/lib/khqr-debt-match.ts): when a KHQR payment comes in from a
-- payer whose name matches ONE open receivable of the same currency that it fits into, the owner is asked in their private
-- chat «is this <customer>'s repayment?» [✅] [❌]. Never booked without that tap. On ✅ the income ALREADY recorded for the
-- payment becomes the repayment — linked to the debt and moved to «ទទួលប្រាក់សងបំណុល» — never a second income.
-- Additive only.

create table if not exists public.khqr_debt_suggestions (
  id             bigserial primary key,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  debt_id        uuid not null references public.debts (id) on delete cascade,
  status         text not null default 'OPEN' check (status in ('OPEN', 'ACCEPTED', 'DECLINED', 'STALE')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
alter table public.khqr_debt_suggestions enable row level security;
revoke all on public.khqr_debt_suggestions from anon, authenticated;

-- The payment and the workspace's open receivables in its currency that it fits into (the name is matched by the server).
create or replace function public.bot_khqr_debt_candidates(p_key text, p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
begin
  perform public.require_bot(p_key);
  select tx.id, tx.workspace_id, tx.amount, tx.currency, k.payer
  into t
  from public.transactions tx
  join public.khqr_payments k on k.transaction_id = tx.id
  join public.categories c on c.id = tx.category_id
  join public.workspaces w on w.id = tx.workspace_id
  where tx.id = p_transaction_id
    and tx.type = 'INCOME' and tx.debt_id is null and c.preset_key = 'sales' and w.type = 'BUSINESS';
  if t.id is null or nullif(btrim(coalesce(t.payer, '')), '') is null then
    return jsonb_build_object('status', 'skipped');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'workspace_id', t.workspace_id,
    'amount', t.amount,
    'currency', t.currency,
    'payer', t.payer,
    'debts', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'party_name', d.party_name, 'remaining', d.total_amount - d.paid_amount))
      from public.debts d
      where d.workspace_id = t.workspace_id and d.type = 'RECEIVABLE' and d.currency = t.currency
        and d.total_amount - d.paid_amount >= t.amount
    ), '[]'::jsonb)
  );
end;
$$;

-- The one suggestion for this payment (a second offer for the same payment is ignored).
create or replace function public.bot_khqr_debt_offer(p_key text, p_transaction_id uuid, p_debt_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public.require_bot(p_key);
  insert into public.khqr_debt_suggestions (workspace_id, transaction_id, debt_id)
  select tx.workspace_id, tx.id, d.id
  from public.transactions tx
  join public.debts d on d.id = p_debt_id and d.workspace_id = tx.workspace_id and d.type = 'RECEIVABLE'
  where tx.id = p_transaction_id and tx.debt_id is null
  on conflict (transaction_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- The owner's tap. ✅: checked again at that moment (still the owner, still open, still fits), then the payment's income is
-- linked to the debt (debt_collection) and its repayment row added — atomically. ❌: the suggestion is closed, nothing changes.
create or replace function public.bot_khqr_debt_settle(p_key text, p_chat_id bigint, p_id bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  s public.khqr_debt_suggestions;
  tx public.transactions;
  d public.debts;
  v_payer text;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into s from public.khqr_debt_suggestions where id = p_id for update;
  if s.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = s.workspace_id and m.user_id = link.uid and m.role = 'OWNER') then
    return jsonb_build_object('status', 'not_owner');
  end if;
  if s.status <> 'OPEN' then
    return jsonb_build_object('status', 'already', 'decision', s.status);
  end if;
  if not p_accept then
    update public.khqr_debt_suggestions set status = 'DECLINED', decided_at = now() where id = s.id;
    return jsonb_build_object('status', 'declined');
  end if;

  select * into tx from public.transactions where id = s.transaction_id for update;
  select * into d from public.debts where id = s.debt_id for update;
  if tx.id is null or d.id is null or tx.debt_id is not null or tx.currency <> d.currency or d.total_amount - d.paid_amount < tx.amount then
    update public.khqr_debt_suggestions set status = 'STALE', decided_at = now() where id = s.id;
    return jsonb_build_object('status', 'stale');
  end if;

  perform public.bot_act_as(link.uid);
  select payer into v_payer from public.khqr_payments where transaction_id = tx.id limit 1;
  -- The transaction first: the repayment row must find its transaction linked (guard_debt_repayment).
  update public.transactions
  set debt_id = d.id,
      category_id = public.ensure_preset_category(d.workspace_id, 'debt_collection', 'INCOME', 'hand-coins', '#0ea5e9', 'ទទួលប្រាក់សងបំណុល')
  where id = tx.id;
  insert into public.debt_repayments (debt_id, wallet_id, amount_paid, payment_date, note, transaction_id)
  values (d.id, tx.wallet_id, tx.amount, tx.transaction_date, left('KHQR · ' || coalesce(v_payer, d.party_name), 500), tx.id);
  update public.khqr_debt_suggestions set status = 'ACCEPTED', decided_at = now() where id = s.id;

  select * into d from public.debts where id = s.debt_id;
  return jsonb_build_object('status', 'settled', 'party', d.party_name, 'amount', tx.amount, 'currency', tx.currency, 'paid_off', d.paid_amount >= d.total_amount);
end;
$$;

revoke all on function public.bot_khqr_debt_candidates(text, uuid) from public;
revoke all on function public.bot_khqr_debt_offer(text, uuid, uuid) from public;
revoke all on function public.bot_khqr_debt_settle(text, bigint, bigint, boolean) from public;
grant execute on function public.bot_khqr_debt_candidates(text, uuid) to anon, authenticated;
grant execute on function public.bot_khqr_debt_offer(text, uuid, uuid) to anon, authenticated;
grant execute on function public.bot_khqr_debt_settle(text, bigint, bigint, boolean) to anon, authenticated;

-- «អតិថិជនទៀងទាត់» counts a KHQR payment that settled a customer's debt too (it is still that customer paying).
create or replace function public.khqr_customer_insights(p_workspace_id uuid, p_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 7), 365);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 7), 365));
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.role = 'OWNER' and w.type = 'BUSINESS'
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  with sales as (
    select btrim(k.payer) as payer, t.amount, t.currency, t.transaction_date as paid_at
    from public.khqr_payments k
    join public.transactions t on t.id = k.transaction_id
    join public.categories c on c.id = t.category_id
    where k.workspace_id = p_workspace_id
      and t.workspace_id = p_workspace_id
      and t.type = 'INCOME' and ((t.debt_id is null and c.preset_key = 'sales') or c.preset_key = 'debt_collection')
      and t.transaction_date >= v_since
      and nullif(btrim(coalesce(k.payer, '')), '') is not null
  ),
  people as (
    select payer,
      count(*) as visits,
      coalesce(sum(amount) filter (where currency = 'KHR'), 0) as khr,
      coalesce(sum(amount) filter (where currency = 'USD'), 0) as usd,
      min(paid_at) as first_at,
      max(paid_at) as last_at
    from sales
    group by payer
  )
  select jsonb_build_object(
    'days', v_days,
    'sales', (select count(*) from sales),
    'payers', (select count(*) from people),
    'regulars', coalesce((
      select jsonb_agg(r order by r.visits desc, r.last_at desc)
      from (
        select payer, visits, khr, usd, last_at
        from people where visits >= 2
        order by visits desc, last_at desc
        limit 10
      ) r), '[]'::jsonb),
    'missing', coalesce((
      select jsonb_agg(m order by m.visits desc)
      from (
        select payer, visits, last_at,
          floor(extract(epoch from (now() - last_at)) / 86400)::int as days_since
        from people
        where visits >= 3
          and now() - last_at > greatest(interval '14 days', 2 * (last_at - first_at) / (visits - 1))
        order by visits desc
        limit 5
      ) m), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'sales', h.n) order by h.hour)
      from (
        select extract(hour from paid_at at time zone 'Asia/Phnom_Penh')::int as hour, count(*) as n
        from sales group by 1
      ) h), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.khqr_customer_insights(uuid, int) from public, anon;
grant execute on function public.khqr_customer_insights(uuid, int) to authenticated;

select public.apply_security_gate();
