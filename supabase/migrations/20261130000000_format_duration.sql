-- One way to say "days to / since a date" everywhere — mirror of
-- formatDuration() in src/lib/format.ts (keep both in step):
--   under 30 days   នៅសល់ ១៥ ថ្ងៃ                   · 15 days left            · 剩余 15天
--   30–364 days     ហួសកំណត់ ៧ ខែ ៦ ថ្ងៃ (២១៨ ថ្ងៃ)   · 7 mos 6 days overdue (218d) · 逾期 7个月6天 (218天)
--   365 days +      នៅសល់ ១០ ឆ្នាំ ៥ ខែ (៣,៨៣៤ ថ្ងៃ) · 10 yrs 5 mos left (3,834d) · 剩余 10年5个月 (3,834天)
-- Calendar months and years counted from today; Khmer in Khmer digits.

create or replace function public.format_duration(
  p_days integer,
  p_kind text,
  p_lang text,
  p_today date default (now() at time zone 'Asia/Phnom_Penh')::date
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  total integer := abs(coalesce(p_days, 0));
  from_d date;
  to_d date;
  months integer;
  y integer;
  m integer;
  d integer;
  sum text := to_char(abs(coalesce(p_days, 0)), 'FM999,999,990');
  parts text;
begin
  -- Whole calendar months, then the days left over — the same arithmetic as
  -- date-fns (differenceInMonths + addMonths), not age(), which borrows days
  -- from the wrong month near month ends.
  if p_kind = 'overdue' then
    from_d := p_today - total;
    to_d := p_today;
  else
    from_d := p_today;
    to_d := p_today + total;
  end if;
  months := (extract(year from to_d)::integer - extract(year from from_d)::integer) * 12
    + extract(month from to_d)::integer - extract(month from from_d)::integer;
  if (from_d + make_interval(months => months))::date > to_d then
    months := months - 1;
  end if;
  y := months / 12;
  m := months % 12;
  d := to_d - (from_d + make_interval(months => months))::date;

  if p_lang = 'km' then
    parts := case
      when total < 30 then total || ' ថ្ងៃ'
      when y > 0 then y || ' ឆ្នាំ' || case when m > 0 then ' ' || m || ' ខែ' else '' end
      else m || ' ខែ' || case when d > 0 then ' ' || d || ' ថ្ងៃ' else '' end
    end;
    return translate(
      case when p_kind = 'overdue' then 'ហួសកំណត់ ' else 'នៅសល់ ' end || parts
        || case when total < 30 then '' else ' (' || sum || ' ថ្ងៃ)' end,
      '0123456789', '០១២៣៤៥៦៧៨៩');
  elsif p_lang = 'zh' then
    parts := case
      when total < 30 then total || '天'
      when y > 0 then y || '年' || case when m > 0 then m || '个月' else '' end
      else m || '个月' || case when d > 0 then d || '天' else '' end
    end;
    return case when p_kind = 'overdue' then '逾期 ' else '剩余 ' end || parts
      || case when total < 30 then '' else ' (' || sum || '天)' end;
  end if;
  parts := case
    when total < 30 then total || case when total = 1 then ' day' else ' days' end
    when y > 0 then y || case when y = 1 then ' yr' else ' yrs' end
      || case when m > 0 then ' ' || m || case when m = 1 then ' mo' else ' mos' end else '' end
    else m || case when m = 1 then ' mo' else ' mos' end
      || case when d > 0 then ' ' || d || case when d = 1 then ' day' else ' days' end else '' end
  end;
  return parts || case when p_kind = 'overdue' then ' overdue' else ' left' end
    || case when total < 30 then '' else ' (' || sum || 'd)' end;
end;
$$;
revoke all on function public.format_duration(integer, text, text, date) from public, anon;
grant execute on function public.format_duration(integer, text, text, date) to authenticated;

-- Debt reminders (app bell + Telegram): "ជិតដល់ថ្ងៃកំណត់ (នៅសល់ ៥ ថ្ងៃ)".
create or replace function public.debt_alert_text(d public.debts, p_stage text, p_days integer, p_lang text, out title text, out body text)
returns record
language plpgsql
stable
set search_path = ''
as $$
declare
  safe_name text := replace(replace(replace(d.party_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  left_amount numeric := d.total_amount - d.paid_amount;
begin
  if p_lang = 'km' then
    title := case p_stage
      when 'OVERDUE' then '🔴 បំណុលហួសកំណត់'
      when 'D0' then '🔴 ដល់ថ្ងៃកំណត់ថ្ងៃនេះ'
      else '🟠 ជិតដល់ថ្ងៃកំណត់ (' || public.format_duration(p_days, 'remaining', 'km') || ')'
    end;
    body := case when d.type = 'PAYABLE' then '📤 ត្រូវសងគេ: ' else '📥 គេជំពាក់យើង: ' end || safe_name
      || E'\n💰 នៅខ្វះ: ' || public.format_money_text(left_amount, d.currency)
      || ' / ' || public.format_money_text(d.total_amount, d.currency)
      || E'\n📅 ថ្ងៃកំណត់: ' || to_char(d.due_date, 'DD/MM/YYYY');
  else
    title := case p_stage
      when 'OVERDUE' then '🔴 Debt overdue'
      when 'D0' then '🔴 Due today'
      else '🟠 Due soon (' || public.format_duration(p_days, 'remaining', 'en') || ')'
    end;
    body := case when d.type = 'PAYABLE' then '📤 I owe: ' else '📥 Owed to me: ' end || safe_name
      || E'\n💰 Remaining: ' || public.format_money_text(left_amount, d.currency)
      || ' of ' || public.format_money_text(d.total_amount, d.currency)
      || E'\n📅 Due: ' || to_char(d.due_date, 'DD/MM/YYYY');
  end if;
end;
$$;

-- Bill reminders (up to 60 days ahead, or overdue for months).
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
  for b in select * from public.recurring_bills where is_active loop
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
