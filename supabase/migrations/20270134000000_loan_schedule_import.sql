-- Loan repayment schedules read from a photo (src/lib/loans/schedule-read.ts):
--   * A bank loan may keep the lender's stated, rounded installment (CLC: $244 for a $242.72 EMI) —
--     bank_loan_rows uses schedule_payment when it is 0.5–10% off the formula (statedEmi in the app).
--   * A monthly LOAN bill linked to the debt (recurring_bills.debt_id): it shows on /bills with the
--     next due date, follows the installments paid on the loan, and sends no reminders of its own
--     (run_debt_alerts already reminds each installment). It can't be marked paid by itself.
--   * bot_import_loan: the bot saves the loan, the installments already paid (one record-only
--     repayment) and the bill in one go.

-- 1 · The stated installment --------------------------------------------------------------------
create or replace function public.bank_loan_rows(d public.debts)
returns table (n integer, due date, principal numeric, interest numeric, fee numeric, balance numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  khr boolean := d.currency = 'KHR';
  yearly double precision;
  r double precision;
  p double precision;
  emi_exact double precision;
  emi numeric;
  stated boolean := false;
  bal numeric;
  days integer;
  i integer;
begin
  if d.schedule_method is distinct from 'BANK' or d.schedule_count is null or d.schedule_principal is null then
    return;
  end if;
  yearly := case when d.interest_period = 'MONTH' then (d.interest_rate::double precision / 100) * 12 else d.interest_rate::double precision / 100 end;
  r := yearly / 12;
  p := d.schedule_principal::double precision;
  emi_exact := case when r = 0 then p / d.schedule_count else (p * r) / (1 - power(1 + r, -d.schedule_count)) end;
  emi := public.loan_round(emi_exact, khr);
  -- The lender's rounded installment (statedEmi): more than 0.5%, at most 10% off the formula.
  if d.schedule_payment is not null and emi > 0
     and abs(d.schedule_payment - emi) / emi > 0.005 and abs(d.schedule_payment - emi) / emi <= 0.1 then
    emi := d.schedule_payment;
    emi_exact := d.schedule_payment::double precision;
    stated := true;
  end if;
  days := d.schedule_first_due - d.start_date;
  bal := d.schedule_principal;
  fee := coalesce(d.schedule_fee, 0);

  for i in 1..d.schedule_count loop
    n := i;
    due := (d.schedule_first_due + make_interval(months => i - 1))::date;
    if i = 1 then
      interest := case when days > 0 then public.loan_round(p * yearly * days / 360, khr) else public.loan_round(p * r, khr) end;
      principal := public.loan_round(emi_exact - p * r, khr);
    else
      interest := public.loan_round(bal::double precision * r, khr);
      principal := emi - interest;
    end if;
    if i = d.schedule_count or principal > bal then
      principal := bal;
    end if;
    if principal < 0 then
      principal := 0;
    end if;
    bal := bal - principal;
    balance := bal;
    return next;
  end loop;
end;
$$;

-- 2 · The bill linked to a loan -----------------------------------------------------------------
alter table public.recurring_bills add column if not exists debt_id uuid references public.debts (id) on delete cascade;
create unique index if not exists recurring_bills_debt_idx on public.recurring_bills (debt_id) where debt_id is not null;

-- The last installment date the loan's payments fully cover (null before the first).
create or replace function public.loan_paid_until(d public.debts)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  rec record;
  cum numeric := 0;
  last_due date;
  covered integer;
begin
  if d.schedule_frequency is null then
    return null;
  end if;
  if d.schedule_method = 'BANK' then
    for rec in select * from public.bank_loan_rows(d) loop
      cum := cum + rec.principal;
      exit when cum > d.paid_amount + 0.001;
      last_due := rec.due;
    end loop;
    return last_due;
  end if;
  covered := least(floor((d.paid_amount + 0.001) / d.schedule_payment)::integer, d.schedule_count);
  if covered <= 0 then
    return null;
  end if;
  return (d.schedule_first_due + case d.schedule_frequency when 'WEEKLY' then interval '7 days' else interval '1 month' end * (covered - 1))::date;
end;
$$;

-- A linked bill follows its loan: paid up to the last covered installment, off once settled.
create or replace function public.sync_loan_bill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.recurring_bills where debt_id = new.id) then
    return null;
  end if;
  perform set_config('luy.loan_sync', 'on', true);
  update public.recurring_bills b
  set paid_until = public.loan_paid_until(new),
      is_active = new.status <> 'SETTLED',
      updated_at = now()
  where b.debt_id = new.id
    and (b.paid_until is distinct from public.loan_paid_until(new) or b.is_active is distinct from (new.status <> 'SETTLED'));
  perform set_config('luy.loan_sync', 'off', true);
  return null;
end;
$$;
drop trigger if exists debts_sync_loan_bill on public.debts;
create trigger debts_sync_loan_bill
  after insert or update on public.debts
  for each row execute function public.sync_loan_bill();

-- Only the loan moves a linked bill's «paid until»; the link stays inside the workspace.
create or replace function public.guard_loan_bill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.debt_id is not null and (tg_op = 'INSERT' or new.debt_id is distinct from old.debt_id)
     and not exists (select 1 from public.debts d where d.id = new.debt_id and d.workspace_id = new.workspace_id) then
    raise exception 'invalid loan' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.debt_id is not null and new.paid_until is distinct from old.paid_until
     and coalesce(current_setting('luy.loan_sync', true), '') <> 'on' then
    raise exception 'loan_linked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists recurring_bills_guard_loan on public.recurring_bills;
create trigger recurring_bills_guard_loan
  before insert or update on public.recurring_bills
  for each row execute function public.guard_loan_bill();

-- Bill reminders: a loan's bill is reminded by the loan (run_debt_alerts), not twice.
create or replace function public.run_bill_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  b public.recurring_bills;
  due date;
  left_days integer;
  snoozed boolean;
  new_id uuid;
  n integer := 0;
begin
  for b in select * from public.recurring_bills where is_active and debt_id is null loop
    due := public.bill_next_due(b);
    left_days := due - today;
    snoozed := b.snooze_on = today;
    continue when not (left_days = 0 or left_days = any (b.remind_days) or snoozed);
    new_id := null;
    insert into public.notifications (workspace_id, bill_id, title, message, type, alert_key, scheduled_at)
    values (
      b.workspace_id, b.id,
      case
        when left_days < 0 then '🧾 ' || public.format_duration(-left_days, 'overdue', 'km', today) || '៖ ' || b.title
        when left_days = 0 then '🧾 ថ្ងៃនេះដល់ថ្ងៃបង់៖ ' || b.title
        else '🧾 ជិតដល់ថ្ងៃបង់ (' || public.format_duration(left_days, 'remaining', 'km', today) || ')៖ ' || b.title
      end,
      b.title || ' · ' || public.format_money_text(b.amount, b.currency) || ' · ថ្ងៃកំណត់ ' || to_char(due, 'DD/MM/YYYY')
        || case when b.kind = 'NSSF' then ' · សូមបង់ឱ្យទាន់ពេល ដើម្បីរក្សាសិទ្ធិ ប.ស.ស.' else ' · សូមបង់ឱ្យទាន់ពេល។' end,
      'DUE_DATE',
      'BILL:' || due::text || ':' || case when snoozed and not (left_days = 0 or left_days = any (b.remind_days)) then 'snz' || today::text else left_days::text end,
      now()
    )
    on conflict (bill_id, alert_key) where bill_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      n := n + 1;
    end if;
    if snoozed then
      update public.recurring_bills set snooze_on = null where id = b.id;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_bill_alerts() from public, anon, authenticated;

-- 3 · The bot's import ----------------------------------------------------------------------------
-- p_loan: party_name, note, currency, principal, interest_rate, start_date, due_date, method (BANK | FLAT),
-- total_amount, count, first_due, payment, paid_amount, paid_date, paid_note, bill_amount.
create or replace function public.bot_import_loan(p_key text, p_chat_id bigint, p_loan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  l jsonb := p_loan;
  existing uuid;
  new_debt uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  -- Installment schedules are PRO, as in the app.
  if public.plan_code_of(link.uid) = 'FREE' then return jsonb_build_object('status', 'plan'); end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then raise exception 'not_writable' using errcode = '42501'; end if;

  -- The same schedule sent twice: the loan already saved.
  select id into existing from public.debts
  where workspace_id = link.ws and type = 'PAYABLE' and status <> 'SETTLED'
    and party_name = l->>'party_name' and schedule_principal = (l->>'principal')::numeric and schedule_first_due = (l->>'first_due')::date
  limit 1;
  if existing is not null then return jsonb_build_object('status', 'duplicate', 'debt_id', existing); end if;

  insert into public.debts (workspace_id, type, party_name, total_amount, currency, interest_rate, interest_period, start_date, due_date, note,
    schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal, schedule_fee)
  values (link.ws, 'PAYABLE', left(l->>'party_name', 80), (l->>'total_amount')::numeric, (l->>'currency')::public.currency_code,
    (l->>'interest_rate')::numeric, 'MONTH', (l->>'start_date')::date, (l->>'due_date')::date, left(l->>'note', 300),
    'MONTHLY', (l->>'count')::smallint, l->>'method', (l->>'first_due')::date, (l->>'payment')::numeric, (l->>'principal')::numeric,
    case when l->>'method' = 'BANK' then 0 end)
  returning id into new_debt;

  -- The installments paid before the photo: one record-only repayment (no wallet, no money moved).
  if coalesce((l->>'paid_amount')::numeric, 0) > 0 then
    insert into public.debt_repayments (debt_id, amount_paid, payment_date, note)
    values (new_debt, (l->>'paid_amount')::numeric, ((l->>'paid_date')::date + time '12:00') at time zone 'Asia/Phnom_Penh', left(l->>'paid_note', 200));
  end if;

  insert into public.recurring_bills (workspace_id, title, kind, amount, currency, frequency, due_day, remind_days, debt_id)
  values (link.ws, left(l->>'party_name', 80), 'LOAN', (l->>'bill_amount')::numeric, (l->>'currency')::public.currency_code, 'MONTHLY',
    extract(day from (l->>'first_due')::date)::integer, '{2}', new_debt);
  -- The bill takes the loan's «paid until» now that both exist.
  update public.debts set paid_amount = paid_amount where id = new_debt;
  return jsonb_build_object('status', 'ok', 'debt_id', new_debt);
end;
$$;
revoke all on function public.bot_import_loan(text, bigint, jsonb) from public;
grant execute on function public.bot_import_loan(text, bigint, jsonb) to anon, authenticated;
