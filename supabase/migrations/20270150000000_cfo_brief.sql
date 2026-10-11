-- Weekly Financial Health Doctor (founder, 11/10/2026): every Sunday from 18:00 Cambodia time (and on
-- /cfo or /healthcheck), the business owner's brief in Telegram — the week's sales and estimated net
-- profit vs the week before, cash vs the bills due in the next 7 days, customers owing for more than
-- 7 days past due, and one tip (src/lib/bot/cfo-brief.ts builds the text).
--
-- Privacy (the bot's standard): only to the workspace OWNER's private chat, and only with «ឱ្យ AI
-- មើលលេខរបស់ខ្ញុំ» (telegram_links.ai_numbers) on — never in a group, never otherwise.

create table if not exists public.cfo_brief_sent (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  week_start   date not null,
  sent_at      timestamptz not null default now(),
  primary key (workspace_id, week_start)
);
alter table public.cfo_brief_sent enable row level security;
revoke all on public.cfo_brief_sent from anon, authenticated;

/** The figures for one Business workspace, in USD (with the workspace's rate for riel). Server only. */
create or replace function public.cfo_brief_data(p_ws uuid, p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
  rate numeric;
  week_start date := p_today - (extract(isodow from p_today)::int - 1);
  t0 timestamptz;
  t1 timestamptz;
  t2 timestamptz;
  skip text[] := array['debt_repayment', 'debt_collection', 'loan_received', 'loan_given', 'adjustment_in', 'adjustment_out',
    'workspace_transfer_in', 'workspace_transfer_out', 'investment', 'owner_draw', 'owner_contribution', 'riba_purification'];
  result jsonb;
begin
  select * into ws from public.workspaces where id = p_ws;
  if ws.id is null then return null; end if;
  rate := coalesce(ws.khr_per_usd, 4000);
  -- Monday 00:00 of this week and of the week before, and tomorrow 00:00 (Cambodia time).
  t0 := ((week_start - 7)::timestamp) at time zone 'Asia/Phnom_Penh';
  t1 := (week_start::timestamp) at time zone 'Asia/Phnom_Penh';
  t2 := ((p_today + 1)::timestamp) at time zone 'Asia/Phnom_Penh';

  with tx as (
    select t.type, c.preset_key,
           case when t.currency = 'USD' then t.amount else t.amount / rate end as usd,
           t.transaction_date >= t1 as this_week
    from public.transactions t
    left join public.categories c on c.id = t.category_id
    where t.workspace_id = p_ws and t.transaction_date >= t0 and t.transaction_date < t2
      and t.type in ('INCOME', 'EXPENSE') and t.debt_id is null
      and coalesce(c.preset_key, '') <> all (skip)
  )
  select jsonb_build_object(
    'workspace', ws.name,
    'currency', coalesce(ws.currency_default::text, 'USD'),
    'rate', rate,
    'week_start', week_start,
    'sales', round(coalesce(sum(usd) filter (where this_week and type = 'INCOME' and preset_key in ('sales', 'services')), 0), 2),
    'sales_prev', round(coalesce(sum(usd) filter (where not this_week and type = 'INCOME' and preset_key in ('sales', 'services')), 0), 2),
    'income', round(coalesce(sum(usd) filter (where this_week and type = 'INCOME'), 0), 2),
    'income_prev', round(coalesce(sum(usd) filter (where not this_week and type = 'INCOME'), 0), 2),
    'expense', round(coalesce(sum(usd) filter (where this_week and type = 'EXPENSE'), 0), 2),
    'expense_prev', round(coalesce(sum(usd) filter (where not this_week and type = 'EXPENSE'), 0), 2)
  ) into result from tx;

  result := result || jsonb_build_object(
    -- Spendable money: no savings goals, no credit cards, nothing archived.
    'cash', (select round(coalesce(sum(case when a.currency = 'USD' then a.balance else a.balance / rate end), 0), 2)
             from public.wallets_accounts a
             where a.workspace_id = p_ws and a.archived_at is null and a.goal_target is null and coalesce(a.kind, 'STANDARD') <> 'CREDIT_CARD'),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object('title', b.title, 'amount', b.amount, 'currency', b.currency, 'due', public.bill_next_due(b)) order by public.bill_next_due(b))
      from public.recurring_bills b
      where b.workspace_id = p_ws and b.is_active and b.kind <> 'DEPOSIT' and public.bill_next_due(b) <= p_today + 7), '[]'::jsonb),
    'receivables', coalesce((
      select jsonb_agg(r order by (r ->> 'days')::int desc) from (
        select jsonb_build_object('party', d.party_name, 'amount', d.total_amount - d.paid_amount, 'currency', d.currency, 'days', p_today - d.due_date) as r
        from public.debts d
        where d.workspace_id = p_ws and d.type = 'RECEIVABLE' and d.paid_amount < d.total_amount
          and d.due_date is not null and d.due_date < p_today - 7
        order by d.due_date
        limit 8
      ) x), '[]'::jsonb)
  );
  return result;
end;
$$;
revoke all on function public.cfo_brief_data(uuid, date) from public, anon, authenticated;

/** Sunday's run: Business workspaces whose owner has numbers on, not yet briefed this week. */
create or replace function public.bot_cfo_recipients(p_key text, p_today date, p_limit integer default 30)
returns table (workspace_id uuid, chat_id bigint, language text, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := p_today - (extract(isodow from p_today)::int - 1);
begin
  perform public.require_bot(p_key);
  return query
    select w.id, l.chat_id, l.language, public.cfo_brief_data(w.id, p_today)
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id and wm.role = 'OWNER'
    join public.telegram_links l on l.user_id = wm.user_id and coalesce(l.ai_numbers, false)
    join public.profiles pr on pr.id = wm.user_id and pr.account_status = 'ACTIVE'
    where w.type::text = 'BUSINESS'
      and not exists (select 1 from public.account_controls c where c.user_id = wm.user_id and c.suspended_at is not null)
      and not exists (select 1 from public.cfo_brief_sent s where s.workspace_id = w.id and s.week_start = v_week)
    order by w.id
    limit least(greatest(p_limit, 1), 200);
end;
$$;
revoke all on function public.bot_cfo_recipients(text, date, integer) from public;
grant execute on function public.bot_cfo_recipients(text, date, integer) to anon, authenticated;

create or replace function public.bot_mark_cfo_sent(p_key text, p_workspace_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.cfo_brief_sent (workspace_id, week_start)
  values (p_workspace_id, p_today - (extract(isodow from p_today)::int - 1))
  on conflict do nothing;
end;
$$;
revoke all on function public.bot_mark_cfo_sent(text, uuid, date) from public;
grant execute on function public.bot_mark_cfo_sent(text, uuid, date) to anon, authenticated;

/**
 * /cfo, /healthcheck: this chat's Business workspace (the linked one when it is a business, else the
 * first business the person owns). Private chats only; numbers on.
 */
create or replace function public.bot_cfo_for_chat(p_key text, p_chat_id bigint, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  numbers boolean;
  ws_id uuid;
begin
  perform public.require_bot(p_key);
  if p_chat_id <= 0 then return jsonb_build_object('status', 'group'); end if;
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then return jsonb_build_object('status', 'not_linked'); end if;
  select coalesce(t.ai_numbers, false) into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  if not numbers then return jsonb_build_object('status', 'off'); end if;
  select w.id into ws_id from public.workspaces w
  join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = link.uid
  where w.type::text = 'BUSINESS' and wm.role = 'OWNER'
  order by (w.id = link.ws) desc, w.created_at
  limit 1;
  if ws_id is null then return jsonb_build_object('status', 'no_business'); end if;
  return jsonb_build_object('status', 'ok', 'data', public.cfo_brief_data(ws_id, p_today));
end;
$$;
revoke all on function public.bot_cfo_for_chat(text, bigint, date) from public;
grant execute on function public.bot_cfo_for_chat(text, bigint, date) to anon, authenticated;

select public.apply_security_gate();
