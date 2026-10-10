-- Loan schedules follow the lender's printed table (the photo is the truth):
--   * schedule_due_dates: the printed due date of each installment (CLC's #9 is 13/10, not 10/10);
--     a null element falls back to first due + months.
--   * schedule_anchor_n / _balance: the printed balance after installment n (CLC: $8,241.00 after
--     #8). The formula drifts a few dollars from a lender that counts actual days; the anchor row's
--     principal absorbs the difference so the balance matches the paper, and later rows run from it.
--   * The linked LOAN bill keeps the loan's real next due date (recurring_bills.next_due).
--   * Loan reminders read: «🔔 រំលឹក៖ កម្ចី … លើកបន្ទាប់ចំនួន $244.00 ត្រូវបង់នៅថ្ងៃ ១៣-តុលា-២០២៦ (នៅសល់ ៣ ថ្ងៃ)!»

alter table public.debts add column if not exists schedule_due_dates date[] check (schedule_due_dates is null or cardinality(schedule_due_dates) <= 600);
alter table public.debts add column if not exists schedule_anchor_n smallint;
alter table public.debts add column if not exists schedule_anchor_balance numeric(18, 2);
alter table public.debts drop constraint if exists debts_schedule_anchor_check;
alter table public.debts add constraint debts_schedule_anchor_check check (
  (schedule_anchor_n is null and schedule_anchor_balance is null)
  or (schedule_anchor_n between 1 and 600 and schedule_anchor_balance >= 0)
);

-- A schedule edited in the app (other first date, count, amount or method) drops the printed overrides.
create or replace function public.reset_printed_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.schedule_first_due, new.schedule_count, new.schedule_principal, new.schedule_method)
       is distinct from (old.schedule_first_due, old.schedule_count, old.schedule_principal, old.schedule_method)
     and (new.schedule_due_dates, new.schedule_anchor_n, new.schedule_anchor_balance)
       is not distinct from (old.schedule_due_dates, old.schedule_anchor_n, old.schedule_anchor_balance) then
    new.schedule_due_dates := null;
    new.schedule_anchor_n := null;
    new.schedule_anchor_balance := null;
  end if;
  return new;
end;
$$;
drop trigger if exists debts_reset_printed_schedule on public.debts;
create trigger debts_reset_printed_schedule before update on public.debts
  for each row execute function public.reset_printed_schedule();

-- Bank loan rows: printed dates, and the printed balance at the anchor (same rules as amortization.ts).
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
  end if;
  days := d.schedule_first_due - d.start_date;
  bal := d.schedule_principal;
  fee := coalesce(d.schedule_fee, 0);

  for i in 1..d.schedule_count loop
    n := i;
    due := coalesce(d.schedule_due_dates[i], (d.schedule_first_due + make_interval(months => i - 1))::date);
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
    -- The printed balance after this row: its principal takes up the difference.
    if i = d.schedule_anchor_n and i < d.schedule_count and d.schedule_anchor_balance <= bal then
      principal := bal - d.schedule_anchor_balance;
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

-- Other scheduled debts: the printed date too.
create or replace function public.debt_next_installment(d public.debts, out n integer, out due date, out amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  covered integer;
  step interval;
  rec record;
  cum numeric := 0;
begin
  if d.schedule_frequency is null or d.paid_amount >= d.total_amount then
    return;
  end if;
  if d.schedule_method = 'BANK' then
    for rec in select * from public.bank_loan_rows(d) loop
      cum := cum + rec.principal;
      if cum > d.paid_amount + 0.001 then
        n := rec.n;
        due := rec.due;
        amount := least(cum, d.total_amount) - d.paid_amount + rec.interest + rec.fee;
        return;
      end if;
    end loop;
    return;
  end if;
  step := case d.schedule_frequency when 'WEEKLY' then interval '7 days' else interval '1 month' end;
  covered := least(floor((d.paid_amount + 0.001) / d.schedule_payment)::integer, d.schedule_count - 1);
  n := covered + 1;
  due := coalesce(d.schedule_due_dates[n], (d.schedule_first_due + step * covered)::date);
  amount := case
    when n = d.schedule_count then d.total_amount - d.paid_amount
    else least(d.schedule_payment * n - d.paid_amount, d.total_amount - d.paid_amount)
  end;
end;
$$;

-- The linked bill's next due date is the loan's next installment.
alter table public.recurring_bills add column if not exists next_due date;

create or replace function public.sync_loan_bill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next date := (public.debt_next_installment(new)).due;
begin
  if not exists (select 1 from public.recurring_bills where debt_id = new.id) then
    return null;
  end if;
  perform set_config('luy.loan_sync', 'on', true);
  update public.recurring_bills b
  set paid_until = public.loan_paid_until(new),
      next_due = v_next,
      is_active = new.status <> 'SETTLED',
      updated_at = now()
  where b.debt_id = new.id
    and (b.paid_until is distinct from public.loan_paid_until(new) or b.next_due is distinct from v_next
         or b.is_active is distinct from (new.status <> 'SETTLED'));
  perform set_config('luy.loan_sync', 'off', true);
  return null;
end;
$$;

create or replace function public.bill_next_due(b public.recurring_bills)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  after_day date := coalesce(b.paid_until, (b.created_at at time zone 'Asia/Phnom_Penh')::date - 1);
  d date;
  i integer := 0;
begin
  -- A loan's bill: the loan's own next installment date (printed, e.g. the 13th).
  if b.debt_id is not null and b.next_due is not null then
    return b.next_due;
  end if;
  if b.frequency = 'MONTHLY' then
    d := public.bill_due_in_month(b.due_day, after_day);
    while d <= after_day and i < 24 loop
      d := public.bill_due_in_month(b.due_day, (date_trunc('month', d) + interval '1 month')::date);
      i := i + 1;
    end loop;
  else
    d := b.due_date;
    while d <= after_day and i < 50 loop
      d := (b.due_date + make_interval(years => i + 1))::date;
      i := i + 1;
    end loop;
  end if;
  return d;
end;
$$;

-- «១៣-តុលា-២០២៦»
create or replace function public.khmer_date(p date)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(extract(day from p)::int::text, '0123456789', '០១២៣៤៥៦៧៨៩') || '-'
    || (array['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'])[extract(month from p)::int]
    || '-' || translate(extract(year from p)::int::text, '0123456789', '០១២៣៤៥៦៧៨៩')
$$;

-- Debt reminders: an installment loan says which installment, how much, which day and how long is left.
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
  title text;
  body text;
  new_id uuid;
  sent integer := 0;
  kh_days text;
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
    if inst.n is not null then
      kh_days := translate(abs(days)::text, '0123456789', '០១២៣៤៥៦៧៨៩');
      title := '🔔 រំលឹក៖ កម្ចី ' || d.party_name || ' លើកបន្ទាប់ចំនួន ' || public.format_money_text(inst.amount, d.currency)
        || ' ត្រូវបង់នៅថ្ងៃ ' || public.khmer_date(due)
        || ' (' || case when days > 0 then 'នៅសល់ ' || kh_days || ' ថ្ងៃ' when days = 0 then 'ថ្ងៃនេះ' else 'ហួសកំណត់ ' || kh_days || ' ថ្ងៃ' end || ')!';
      body := '🧾 បង់រំលោះលើកទី ' || inst.n || '/' || d.schedule_count || ': ' || public.format_money_text(inst.amount, d.currency);
    else
      title := txt.title;
      body := coalesce(txt.body, '');
    end if;
    new_id := null;
    insert into public.notifications (workspace_id, debt_id, title, message, type, alert_key, scheduled_at)
    values (d.workspace_id, d.id, title, body, 'DUE_DATE', key, now())
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

-- The bot's import also saves the printed dates and the printed balance at the import point.
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
    schedule_frequency, schedule_count, schedule_method, schedule_first_due, schedule_payment, schedule_principal, schedule_fee,
    schedule_due_dates, schedule_anchor_n, schedule_anchor_balance)
  values (link.ws, 'PAYABLE', left(l->>'party_name', 80), (l->>'total_amount')::numeric, (l->>'currency')::public.currency_code,
    (l->>'interest_rate')::numeric, 'MONTH', (l->>'start_date')::date, (l->>'due_date')::date, left(l->>'note', 300),
    'MONTHLY', (l->>'count')::smallint, l->>'method', (l->>'first_due')::date, (l->>'payment')::numeric, (l->>'principal')::numeric,
    case when l->>'method' = 'BANK' then 0 end,
    case when jsonb_typeof(l->'due_dates') = 'array' then (select array_agg(nullif(x, 'null')::date order by o) from jsonb_array_elements_text(l->'due_dates') with ordinality as t(x, o)) end,
    (l->>'anchor_n')::smallint, (l->>'anchor_balance')::numeric)
  returning id into new_debt;

  -- The installments paid before the photo: one record-only repayment (no wallet, no money moved).
  if coalesce((l->>'paid_amount')::numeric, 0) > 0 then
    insert into public.debt_repayments (debt_id, amount_paid, payment_date, note)
    values (new_debt, (l->>'paid_amount')::numeric, ((l->>'paid_date')::date + time '12:00') at time zone 'Asia/Phnom_Penh', left(l->>'paid_note', 200));
  end if;

  insert into public.recurring_bills (workspace_id, title, kind, amount, currency, frequency, due_day, remind_days, debt_id)
  values (link.ws, left(l->>'party_name', 80), 'LOAN', (l->>'bill_amount')::numeric, (l->>'currency')::public.currency_code, 'MONTHLY',
    extract(day from (l->>'first_due')::date)::integer, '{2}', new_debt);
  -- The bill takes the loan's «paid until» and next date now that both exist.
  update public.debts set paid_amount = paid_amount where id = new_debt;
  return jsonb_build_object('status', 'ok', 'debt_id', new_debt);
end;
$$;
revoke all on function public.bot_import_loan(text, bigint, jsonb) from public;
grant execute on function public.bot_import_loan(text, bigint, jsonb) to anon, authenticated;
