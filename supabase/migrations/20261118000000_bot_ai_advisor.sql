-- Phase 5: LuyChlat AI in the Telegram bot (/ai, /ask, 🤖 button, questions).
--   * PRO / ULTRA only, sharing the in-app advisor's monthly quota (use_ai_query).
--   * Personal numbers are opt-in (telegram_links.ai_numbers, off by default):
--     the no-balances-in-chat rule stays the default, since whoever holds the
--     Telegram account would see them. Off: general guidance only.
--   * The server anonymises what it sends to the AI (W1 / C1 references, debt
--     totals only — never names); "who owes me" is answered from the database.
--   * A short per-chat session: waiting for a question after /ai, and the last
--     two exchanges for follow-ups (30 minutes).

alter table public.telegram_links add column if not exists ai_numbers boolean not null default false;
grant update (ai_numbers) on public.telegram_links to authenticated;

create table if not exists public.bot_ai_sessions (
  chat_id        bigint primary key,
  awaiting_until timestamptz,
  -- [{"q": "...", "a": "..."}], at most 2, answers as the AI wrote them (references, not names)
  history        jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array' and pg_column_size(history) < 16000),
  updated_at     timestamptz not null default now()
);
alter table public.bot_ai_sessions enable row level security;
revoke all on public.bot_ai_sessions from anon, authenticated;

-- What the AI may be told about a linked chat's account. Returns a status
-- (not_linked / plan_required / quota_exceeded) or 'ok' with the quota, the
-- session and — only with ai_numbers on — this month's figures.
create or replace function public.bot_ai_context(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  quota jsonb;
  numbers boolean;
  ws public.workspaces;
  rate numeric;
  month_from timestamptz := (date_trunc('month', now() at time zone 'Asia/Phnom_Penh')) at time zone 'Asia/Phnom_Penh';
  sess public.bot_ai_sessions;
  figures jsonb := null;
  non_operating text[] := array['debt_repayment', 'debt_collection', 'loan_received', 'loan_given', 'adjustment_in', 'adjustment_out'];
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  perform public.bot_act_as(link.uid);
  quota := public.use_ai_query(false);
  if not (quota ->> 'ok')::boolean then
    return jsonb_build_object('status', quota ->> 'reason', 'quota', quota);
  end if;

  select t.ai_numbers into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  select * into ws from public.workspaces w where w.id = link.ws;
  rate := coalesce(ws.khr_per_usd, 4000);
  select * into sess from public.bot_ai_sessions s where s.chat_id = p_chat_id and s.updated_at > now() - interval '30 minutes';

  if numbers and public.is_workspace_member(link.ws) then
    with tx as (
      select t.type, t.amount, t.currency, c.preset_key, c.name as category,
             case when t.currency = 'USD' then t.amount else t.amount / rate end as usd
      from public.transactions t
      join public.wallets_accounts w on w.id = t.wallet_id
      left join public.categories c on c.id = t.category_id
      where t.workspace_id = link.ws and t.transaction_date >= month_from and t.type in ('INCOME', 'EXPENSE')
        and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = link.uid)
        and coalesce(c.preset_key, '') <> all (non_operating)
    )
    select jsonb_build_object(
      'workspace_type', ws.type,
      'khr_per_usd', rate,
      'month', to_char(now() at time zone 'Asia/Phnom_Penh', 'YYYY-MM'),
      'day', extract(day from now() at time zone 'Asia/Phnom_Penh')::integer,
      'income_usd', round(coalesce((select sum(usd) from tx where type = 'INCOME'), 0), 2),
      'expense_usd', round(coalesce((select sum(usd) from tx where type = 'EXPENSE'), 0), 2),
      'income', jsonb_build_object('USD', coalesce((select sum(amount) from tx where type = 'INCOME' and currency = 'USD'), 0),
                                   'KHR', coalesce((select sum(amount) from tx where type = 'INCOME' and currency = 'KHR'), 0)),
      'expense', jsonb_build_object('USD', coalesce((select sum(amount) from tx where type = 'EXPENSE' and currency = 'USD'), 0),
                                    'KHR', coalesce((select sum(amount) from tx where type = 'EXPENSE' and currency = 'KHR'), 0)),
      'top_expenses', coalesce((
        select jsonb_agg(x order by x.usd desc) from (
          select preset_key, max(category) as name, round(sum(usd), 2) as usd
          from tx where type = 'EXPENSE' group by preset_key, coalesce(preset_key, category)
          order by sum(usd) desc limit 3
        ) x), '[]'::jsonb),
      'wallets', coalesce((
        select jsonb_agg(jsonb_build_object('name', w.name, 'currency', w.currency, 'balance', w.balance, 'kind', w.kind) order by w.created_at)
        from public.wallets_accounts w
        where w.workspace_id = link.ws and w.archived_at is null
          and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = link.uid)), '[]'::jsonb),
      'debts', (
        select jsonb_build_object(
          'owed_to_you_usd', round(coalesce(sum(case when d.currency = 'USD' then d.total_amount - d.paid_amount else (d.total_amount - d.paid_amount) / rate end) filter (where d.type = 'RECEIVABLE'), 0), 2),
          'owed_to_you_count', count(*) filter (where d.type = 'RECEIVABLE'),
          'you_owe_usd', round(coalesce(sum(case when d.currency = 'USD' then d.total_amount - d.paid_amount else (d.total_amount - d.paid_amount) / rate end) filter (where d.type = 'PAYABLE'), 0), 2),
          'you_owe_count', count(*) filter (where d.type = 'PAYABLE'),
          'overdue_owed_to_you', count(*) filter (where d.type = 'RECEIVABLE' and d.due_date < (now() at time zone 'Asia/Phnom_Penh')::date),
          'overdue_you_owe', count(*) filter (where d.type = 'PAYABLE' and d.due_date < (now() at time zone 'Asia/Phnom_Penh')::date))
        from public.debts d where d.workspace_id = link.ws and d.paid_amount < d.total_amount)
    ) into figures;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'quota', quota,
    'numbers', coalesce(numbers, false),
    'awaiting', coalesce(sess.awaiting_until > now(), false),
    'history', coalesce(sess.history, '[]'::jsonb),
    'figures', figures
  );
end;
$$;
revoke all on function public.bot_ai_context(text, bigint) from public;
grant execute on function public.bot_ai_context(text, bigint) to anon, authenticated;

-- After /ai alone (or the 🤖 button): the next message is the question (10 minutes).
create or replace function public.bot_ai_await(p_key text, p_chat_id bigint, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.bot_ai_sessions (chat_id, awaiting_until, updated_at)
  values (p_chat_id, case when p_on then now() + interval '10 minutes' end, now())
  on conflict (chat_id) do update set awaiting_until = excluded.awaiting_until,
    history = case when public.bot_ai_sessions.updated_at > now() - interval '30 minutes' then public.bot_ai_sessions.history else '[]'::jsonb end,
    updated_at = now();
end;
$$;
revoke all on function public.bot_ai_await(text, bigint, boolean) from public;
grant execute on function public.bot_ai_await(text, bigint, boolean) to anon, authenticated;

-- Cheap check for every plain message: is this chat waiting for its /ai question?
create or replace function public.bot_ai_awaiting(p_key text, p_chat_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return exists (select 1 from public.bot_ai_sessions s where s.chat_id = p_chat_id and s.awaiting_until > now());
end;
$$;
revoke all on function public.bot_ai_awaiting(text, bigint) from public;
grant execute on function public.bot_ai_awaiting(text, bigint) to anon, authenticated;

-- An answered question: counts one AI query and keeps the last two exchanges.
create or replace function public.bot_ai_commit(p_key text, p_chat_id bigint, p_question text, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  turn jsonb := jsonb_build_array(jsonb_build_object('q', left(coalesce(p_question, ''), 1000), 'a', left(coalesce(p_answer, ''), 3000)));
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return null;
  end if;
  perform public.bot_act_as(link.uid);
  insert into public.bot_ai_sessions (chat_id, awaiting_until, history, updated_at)
  values (p_chat_id, null, turn, now())
  on conflict (chat_id) do update set awaiting_until = null,
    history = case when public.bot_ai_sessions.updated_at > now() - interval '30 minutes'
                   then (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from (
                           select e, o from jsonb_array_elements(public.bot_ai_sessions.history || turn) with ordinality as h (e, o)
                           order by o desc limit 2) z)
                   else turn end,
    updated_at = now();
  return public.use_ai_query(true);
end;
$$;
revoke all on function public.bot_ai_commit(text, bigint, text, text) from public;
grant execute on function public.bot_ai_commit(text, bigint, text, text) to anon, authenticated;

-- "Who owes me?": the open receivables of the chat's workspace, from the
-- database (names never go to the AI). Only with ai_numbers on.
create or replace function public.bot_ai_debtors(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if not coalesce((select t.ai_numbers from public.telegram_links t where t.chat_id = p_chat_id), false) then
    return jsonb_build_object('status', 'off');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.is_workspace_member(link.ws) then
    return jsonb_build_object('status', 'not_linked');
  end if;
  return jsonb_build_object('status', 'ok', 'debtors', coalesce((
    select jsonb_agg(jsonb_build_object('name', d.party_name, 'remaining', d.total_amount - d.paid_amount, 'currency', d.currency, 'due_date', d.due_date)
                     order by d.due_date nulls last, d.created_at)
    from (select * from public.debts d where d.workspace_id = link.ws and d.type = 'RECEIVABLE' and d.paid_amount < d.total_amount
          order by d.due_date nulls last, d.created_at limit 20) d), '[]'::jsonb));
end;
$$;
revoke all on function public.bot_ai_debtors(text, bigint) from public;
grant execute on function public.bot_ai_debtors(text, bigint) to anon, authenticated;

select public.apply_security_gate();
