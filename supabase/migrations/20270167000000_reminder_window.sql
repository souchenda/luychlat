-- Reminders only in the last week, never for what is paid (founder, 16/10/2026).
-- The bug: run_bill_alerts set «snoozed := b.snooze_on = today», NULL for a bill never snoozed, and
-- «continue when not (… or NULL)» is «continue when NULL», which never skips — every active bill alerted
-- every day: «ជិតដល់ថ្ងៃបង់ (នៅសល់ ១ ខែ ២៩ ថ្ងៃ (៦០ ថ្ងៃ))» for an EDC bill already paid through 15/11.
--   1. bill_alert_due(): the due day, a chosen reminder day within D-1…D-7, or a snooze within that window.
--   2. A bill's reminders for a paid period, and a loan's for paid installments (all once settled), are
--      deleted as soon as the payment is recorded.
--   3. The bogus reminders already sent are deleted.
-- Loans' own alerts were right (D-7 / D-3 / the day / overdue for the next installment); the 3-year text
-- came from the app re-rendering with the loan's maturity date — fixed in notification-bell.tsx.

create or replace function public.bill_alert_due(p_left integer, p_remind integer[], p_snoozed boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_left = 0
    or (p_left between 1 and 7 and p_left = any (coalesce(p_remind, '{}'::integer[])))
    or (coalesce(p_snoozed, false) and p_left <= 7),
    false);
$$;

-- The rule checked here: a wrong one fails the deploy.
do $$
begin
  assert public.bill_alert_due(60, '{2}', null) = false, '60 days, not snoozed (NULL) must not alert';
  assert public.bill_alert_due(31, '{2}', false) = false, '31 days must not alert';
  assert public.bill_alert_due(15, '{15}', false) = false, 'more than 7 days must not alert even if chosen';
  assert public.bill_alert_due(2, '{2}', null) = true, 'the chosen D-2 alerts';
  assert public.bill_alert_due(7, '{7,3}', false) = true, 'D-7 alerts when chosen';
  assert public.bill_alert_due(5, '{2}', false) = false, 'a day not chosen does not alert';
  assert public.bill_alert_due(0, '{}', null) = true, 'the due day alerts';
  assert public.bill_alert_due(1, null, true) = true, 'a snooze within the week alerts';
  assert public.bill_alert_due(40, '{2}', true) = false, 'a snooze never brings a far-off bill';
end $$;

CREATE OR REPLACE FUNCTION public.run_bill_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  b public.recurring_bills;
  due date;
  left_days integer;
  snoozed boolean;
  new_id uuid;
  n integer := 0;
  deposit boolean;
begin
  for b in select * from public.recurring_bills where is_active and debt_id is null loop
    deposit := b.kind = 'DEPOSIT';
    due := public.bill_next_due(b);
    left_days := due - today;
    -- coalesce: a bill never snoozed has snooze_on NULL — «= today» was NULL, and «continue when NULL» never
    -- skipped, so every bill alerted every day (founder, 16/10/2026: 31 and 60 days before, for paid months).
    snoozed := coalesce(b.snooze_on = today, false);
    continue when not public.bill_alert_due(left_days, b.remind_days, snoozed);
    continue when deposit and left_days < 0;
    new_id := null;
    insert into public.notifications (workspace_id, bill_id, title, message, type, alert_key, scheduled_at)
    values (
      b.workspace_id, b.id,
      case
        when deposit and left_days = 0 then '💰 ថ្ងៃនេះ ប្រាក់បញ្ញើដល់កាលកំណត់៖ ' || b.title
        when deposit then '💰 ប្រាក់បញ្ញើជិតដល់កាលកំណត់ (' || public.format_duration(left_days, 'remaining', 'km', today) || ')៖ ' || b.title
        when left_days < 0 then '🧾 ' || public.format_duration(-left_days, 'overdue', 'km', today) || '៖ ' || b.title
        when left_days = 0 then '🧾 ថ្ងៃនេះដល់ថ្ងៃបង់៖ ' || b.title
        else '🧾 ជិតដល់ថ្ងៃបង់ (' || public.format_duration(left_days, 'remaining', 'km', today) || ')៖ ' || b.title
      end,
      case
        when deposit then b.title || ' · ' || public.format_money_text(b.amount, b.currency) || ' · ដល់កាលកំណត់ ' || to_char(due, 'DD/MM/YYYY')
          || ' · សូមពិនិត្យប្រាក់ចូលគណនី ឬបន្តបញ្ញើ។'
        else b.title || ' · ' || public.format_money_text(b.amount, b.currency) || ' · ថ្ងៃកំណត់ ' || to_char(due, 'DD/MM/YYYY')
          || case when b.kind = 'NSSF' then ' · សូមបង់ឱ្យទាន់ពេល ដើម្បីរក្សាសិទ្ធិ ប.ស.ស.' else ' · សូមបង់ឱ្យទាន់ពេល។' end
      end,
      'DUE_DATE',
      case when deposit then 'DEPOSIT:' else 'BILL:' end || due::text || ':'
        || case when snoozed and not public.bill_alert_due(left_days, b.remind_days, false) then 'snz' || today::text else left_days::text end,
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
$function$;

-- 2a. A bill paid (paid_until moved on): its reminders for that period go at once.
create or replace function public.bill_clear_paid_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paid_until is not null and new.paid_until is distinct from old.paid_until then
    delete from public.notifications n
    where n.bill_id = new.id
      and n.alert_key ~ '^(BILL|DEPOSIT):\d{4}-\d{2}-\d{2}:'
      and split_part(n.alert_key, ':', 2)::date <= new.paid_until;
  end if;
  return new;
end;
$$;
drop trigger if exists recurring_bills_clear_paid_alerts on public.recurring_bills;
create trigger recurring_bills_clear_paid_alerts after update of paid_until on public.recurring_bills
  for each row execute function public.bill_clear_paid_alerts();

-- 2b. A loan payment recorded (paid amount / status changed): reminders for installments now paid go;
-- all of them once the loan is settled.
create or replace function public.debt_clear_paid_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_due date;
begin
  if new.status = 'SETTLED' then
    delete from public.notifications n where n.debt_id = new.id and n.type = 'DUE_DATE';
    return new;
  end if;
  next_due := (public.debt_next_installment(new)).due;
  if next_due is not null then
    delete from public.notifications n
    where n.debt_id = new.id and n.type = 'DUE_DATE'
      and n.alert_key ~ ':\d{4}-\d{2}-\d{2}$'
      and split_part(n.alert_key, ':', 2)::date < next_due;
  end if;
  return new;
end;
$$;
drop trigger if exists debts_clear_paid_alerts on public.debts;
create trigger debts_clear_paid_alerts after update on public.debts
  for each row when (old.paid_amount is distinct from new.paid_amount or old.status is distinct from new.status)
  execute function public.debt_clear_paid_alerts();

-- 3. The bogus reminders already sent: more than 7 days ahead, a bill period already paid, a loan
-- installment already paid, or a settled loan.
delete from public.notifications n
where n.bill_id is not null and n.alert_key ~ '^(BILL|DEPOSIT):\d{4}-\d{2}-\d{2}:\d+$'
  and split_part(n.alert_key, ':', 3)::integer > 7;
delete from public.notifications n
using public.recurring_bills b
where n.bill_id = b.id and b.paid_until is not null
  and n.alert_key ~ '^(BILL|DEPOSIT):\d{4}-\d{2}-\d{2}:'
  and split_part(n.alert_key, ':', 2)::date <= b.paid_until;
delete from public.notifications n
using public.debts d
where n.debt_id = d.id and n.type = 'DUE_DATE'
  and (d.status = 'SETTLED'
       or (n.alert_key ~ ':\d{4}-\d{2}-\d{2}$'
           and split_part(n.alert_key, ':', 2)::date < coalesce((public.debt_next_installment(d)).due, '9999-12-31'::date)));
