-- Phase B: installment schedules on debts (PRO). The app computes the schedule
-- (lib/loans/amortization.ts) and stores its shape here; with a schedule,
-- total_amount is the total to repay (principal + interest) and due_date the
-- last installment, so balances, status and net worth work unchanged. Payments
-- cover installments oldest first; reminders follow the next unpaid one.

alter table public.debts add column if not exists schedule_frequency text;
alter table public.debts add column if not exists schedule_count smallint;
alter table public.debts add column if not exists schedule_method text;
alter table public.debts add column if not exists schedule_first_due date;
-- Regular installment (the last one may differ by rounding) and the amount borrowed.
alter table public.debts add column if not exists schedule_payment numeric(18, 2);
alter table public.debts add column if not exists schedule_principal numeric(18, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'debts_schedule_check') then
    -- num_nulls: a CHECK that evaluates to NULL passes, so test the nulls explicitly.
    alter table public.debts add constraint debts_schedule_check check (
      num_nulls(schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal) = 6
      or (
        num_nulls(schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal) = 0
        and schedule_frequency in ('MONTHLY', 'WEEKLY') and schedule_count between 1 and 600
        and schedule_method in ('FLAT', 'REDUCING') and schedule_payment > 0 and schedule_principal > 0
      )
    );
  end if;
end $$;

grant update (schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal)
  on public.debts to authenticated;

-- Phase A's card rule had the same NULL gap (a card without a limit passed):
-- replace it with explicit null counts.
alter table public.wallets_accounts drop constraint if exists wallets_credit_card_check;
alter table public.wallets_accounts add constraint wallets_credit_card_check check (
  (kind = 'STANDARD' and num_nulls(credit_limit, statement_day, due_day) = 3)
  or (kind = 'CREDIT_CARD' and num_nulls(credit_limit, statement_day, due_day) = 0 and goal_target is null
      and credit_limit > 0 and statement_day between 1 and 31 and due_day between 1 and 31)
);

-- Installment schedules are a PRO feature; removing one is always allowed.
create or replace function public.guard_debt_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or new.schedule_frequency is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (new.schedule_frequency, new.schedule_count, new.schedule_method, new.schedule_first_due, new.schedule_payment, new.schedule_principal)
      is not distinct from (old.schedule_frequency, old.schedule_count, old.schedule_method, old.schedule_first_due, old.schedule_payment, old.schedule_principal) then
    return new;
  end if;
  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists debts_guard_schedule on public.debts;
create trigger debts_guard_schedule
  before insert or update of schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal
  on public.debts
  for each row execute function public.guard_debt_schedule();

-- The next unpaid installment: its number (1-based), due date and amount still
-- owed on it. Null without a schedule or when everything is paid.
create or replace function public.debt_next_installment(d public.debts, out n integer, out due date, out amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  covered integer;
  step interval;
begin
  if d.schedule_frequency is null or d.paid_amount >= d.total_amount then
    return;
  end if;
  step := case d.schedule_frequency when 'WEEKLY' then interval '7 days' else interval '1 month' end;
  covered := least(floor((d.paid_amount + 0.001) / d.schedule_payment)::integer, d.schedule_count - 1);
  n := covered + 1;
  due := (d.schedule_first_due + step * covered)::date;
  -- What's left of this installment (the last one takes the remainder).
  amount := case
    when n = d.schedule_count then d.total_amount - d.paid_amount
    else least(d.schedule_payment * n - d.paid_amount, d.total_amount - d.paid_amount)
  end;
end;
$$;

-- Debt reminders: scheduled loans are reminded of each installment (keyed by
-- its date, so every month gets its own D7 / D3 / D0 / overdue alert).
create or replace function public.run_debt_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  d public.debts;
  inst record;
  due date;
  key text;
  m record;
  stage text;
  days integer;
  txt record;
  extra text;
  new_id uuid;
  sent integer := 0;
begin
  -- Keep stored statuses fresh (OVERDUE depends on the date).
  update public.debts set paid_amount = paid_amount
  where status in ('ACTIVE', 'PARTIALLY_PAID') and due_date < current_date;

  for d in select * from public.debts where status <> 'SETTLED' and (due_date is not null or schedule_frequency is not null) loop
    inst := public.debt_next_installment(d);
    due := coalesce(inst.due, d.due_date);
    continue when due is null;
    stage := public.debt_alert_stage(due, today);
    continue when stage is null;
    days := due - today;
    key := case when inst.due is null then stage else stage || ':' || inst.due::text end;

    -- In-app text is re-rendered in the viewer's language by the app.
    d.due_date := due;
    select * into txt from public.debt_alert_text(d, stage, days, 'km');
    extra := case when inst.n is null then '' else
      E'\n🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency) end;
    new_id := null;
    insert into public.notifications (workspace_id, debt_id, title, message, type, alert_key, scheduled_at)
    values (d.workspace_id, d.id, txt.title, coalesce(txt.body, '') || coalesce(extra, ''), 'DUE_DATE', key, now())
    on conflict (debt_id, alert_key) do nothing
    returning id into new_id;
    continue when new_id is null;

    for m in
      select ts.bot_token, ts.chat_id, ts.language
      from public.workspace_members wm
      join public.telegram_settings ts on ts.user_id = wm.user_id
      where wm.workspace_id = d.workspace_id and ts.enabled
    loop
      select * into txt from public.debt_alert_text(d, stage, days, m.language);
      extra := case when inst.n is null then '' when m.language = 'km' then
          E'\n🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency)
        else E'\n🧾 Installment ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency) end;
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || m.bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', m.chat_id,
          'parse_mode', 'HTML',
          'text', '<b>' || txt.title || E'</b>\n' || txt.body || extra || E'\n\n— លុយឆ្លាត · LuyChlat'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;
revoke all on function public.run_debt_alerts() from public, anon, authenticated;

-- Card alerts reach every member of the workspace with Telegram on (as debt alerts do).
create or replace function public.run_card_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  w public.wallets_accounts;
  m record;
  due date;
  stage text;
  title text;
  body text;
  safe_name text;
  new_id uuid;
  sent integer := 0;
begin
  for w in select * from public.wallets_accounts where kind = 'CREDIT_CARD' and archived_at is null and balance < 0 loop
    due := public.card_next_due(w.statement_day, w.due_day, today);
    continue when due is null;
    stage := case due - today when 3 then 'D3' when 0 then 'D0' else null end;
    continue when stage is null;
    safe_name := replace(replace(replace(w.name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

    new_id := null;
    insert into public.notifications (workspace_id, wallet_id, title, message, type, alert_key, scheduled_at)
    values (
      w.workspace_id, w.id,
      case stage when 'D0' then '🔔 ប័ណ្ណឥណទានដល់ថ្ងៃបង់ថ្ងៃនេះ' else '🔔 ប័ណ្ណឥណទានជិតដល់ថ្ងៃបង់ (៣ ថ្ងៃទៀត)' end,
      'កាបូបប័ណ្ណឥណទាន ' || w.name || ' មានបំណុលត្រូវសង ' || public.format_money_text(-w.balance, w.currency)
        || ' ដល់ថ្ងៃកំណត់នៅថ្ងៃទី ' || to_char(due, 'DD/MM/YYYY') || '! សូមបង់ផ្ដាច់ឱ្យបានទាន់ពេល ដើម្បីជៀសវាងការប្រាក់ធនាគារ។',
      'DUE_DATE', 'CC:' || due::text || ':' || stage, now()
    )
    on conflict (wallet_id, alert_key) where wallet_id is not null do nothing
    returning id into new_id;
    continue when new_id is null;

    for m in
      select ts.bot_token, ts.chat_id, ts.language
      from public.workspace_members wm
      join public.telegram_settings ts on ts.user_id = wm.user_id
      where wm.workspace_id = w.workspace_id and ts.enabled
    loop
      if coalesce(m.language, 'km') = 'km' then
        title := case stage when 'D0' then '🔔 ប័ណ្ណឥណទានដល់ថ្ងៃបង់ថ្ងៃនេះ' else '🔔 ប័ណ្ណឥណទានជិតដល់ថ្ងៃបង់ (៣ ថ្ងៃទៀត)' end;
        body := 'កាបូបប័ណ្ណឥណទាន ' || safe_name || ' មានបំណុលត្រូវសង ' || public.format_money_text(-w.balance, w.currency)
          || ' ដល់ថ្ងៃកំណត់នៅថ្ងៃទី ' || to_char(due, 'DD/MM/YYYY')
          || '! សូមបង់ផ្ដាច់ឱ្យបានទាន់ពេល ដើម្បីជៀសវាងការប្រាក់ធនាគារ។';
      else
        title := case stage when 'D0' then '🔔 Credit card payment due today' else '🔔 Credit card payment due in 3 days' end;
        body := safe_name || ' has ' || public.format_money_text(-w.balance, w.currency) || ' to pay by '
          || to_char(due, 'DD/MM/YYYY') || '. Pay it in full on time to avoid bank interest.';
      end if;
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || m.bot_token || '/sendMessage',
        body := jsonb_build_object('chat_id', m.chat_id, 'parse_mode', 'HTML',
          'text', '<b>' || title || E'</b>\n' || body || E'\n\n— លុយឆ្លាត · LuyChlat'),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;
revoke all on function public.run_card_alerts() from public, anon, authenticated;

select public.apply_security_gate();
