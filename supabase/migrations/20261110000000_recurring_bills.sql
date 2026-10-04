-- Bills & reminders: recurring bills of a workspace (electricity, water,
-- internet, rent, waste, loan repayments, NSSF contributions, other), with
-- reminders N days before each due date — in the app's notifications and, for
-- linked chats with due alerts on, in Telegram (the same pipeline as debt and
-- credit-card reminders). "Paid" covers one due date at a time and can log
-- the expense in a wallet.
--
-- NSSF (ប.ស.ស.) presets are defaults the user can edit (amounts and due rules
-- change; the app tells users to check them with NSSF).

create table if not exists public.recurring_bills (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  kind          text not null default 'OTHER' check (kind in ('ELECTRICITY', 'WATER', 'INTERNET', 'RENT', 'WASTE', 'LOAN', 'NSSF', 'OTHER')),
  amount        numeric(15, 2) not null check (amount > 0),
  currency      public.currency_code not null default 'KHR',
  frequency     text not null default 'MONTHLY' check (frequency in ('MONTHLY', 'YEARLY')),
  -- MONTHLY: day of the month (29–31 fall on the month's last day when shorter).
  due_day       integer check (due_day between 1 and 31),
  -- YEARLY: the first due date; later ones fall on the same day each year.
  due_date      date,
  nssf_type     text check (nssf_type in ('self_employed_monthly', 'self_employed_yearly', 'enterprise')),
  -- Days before the due date to remind (the due day itself is always reminded).
  remind_days   integer[] not null default '{2}' check (array_length(remind_days, 1) <= 5 and 0 <= all (remind_days) and 60 >= all (remind_days)),
  category_id   uuid references public.categories (id) on delete set null,
  -- The last due date that is paid; the next one is the first after it.
  paid_until    date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((frequency = 'MONTHLY' and due_day is not null) or (frequency = 'YEARLY' and due_date is not null))
);
create index if not exists recurring_bills_workspace_idx on public.recurring_bills (workspace_id);
alter table public.recurring_bills enable row level security;

drop policy if exists recurring_bills_select on public.recurring_bills;
create policy recurring_bills_select on public.recurring_bills
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists recurring_bills_insert on public.recurring_bills;
create policy recurring_bills_insert on public.recurring_bills
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists recurring_bills_update on public.recurring_bills;
create policy recurring_bills_update on public.recurring_bills
  for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
drop policy if exists recurring_bills_delete on public.recurring_bills;
create policy recurring_bills_delete on public.recurring_bills
  for delete to authenticated using (public.can_write_workspace(workspace_id));
grant select, insert, update, delete on public.recurring_bills to authenticated;

-- The category must belong to the bill's workspace.
create or replace function public.guard_bill_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.workspace_id = new.workspace_id) then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists recurring_bills_guard on public.recurring_bills;
create trigger recurring_bills_guard before insert or update on public.recurring_bills
  for each row execute function public.guard_bill_category();

-- The due date of a bill in a given month (day clamped to the month's length).
create or replace function public.bill_due_in_month(p_day integer, p_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_month)::date + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer) - 1));
$$;

-- The next unpaid due date: the first occurrence after paid_until (or, for a
-- new bill, the first on or after the day it was created). It may be in the
-- past (overdue).
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
grant execute on function public.bill_next_due(public.recurring_bills) to authenticated;

-- Mark the next due date as paid; optionally log the expense in a wallet.
create or replace function public.mark_bill_paid(p_bill_id uuid, p_wallet_id uuid default null, p_amount numeric default null, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.recurring_bills;
  due date;
  w public.wallets_accounts;
  rate numeric;
  tx_id uuid;
begin
  select * into b from public.recurring_bills where id = p_bill_id for update;
  if b.id is null or not public.can_write_workspace(b.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  due := public.bill_next_due(b);
  if p_wallet_id is not null then
    perform public.require_wallet_writer(p_wallet_id);
    select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = b.workspace_id;
    if w.id is null then
      raise exception 'invalid wallet' using errcode = '22023';
    end if;
    select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = b.workspace_id;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, exchange_rate, created_by)
    values (b.workspace_id, w.id, b.category_id, coalesce(p_amount, b.amount), b.currency, 'EXPENSE',
            coalesce(p_date::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours', now()), left(b.title, 500),
            case when w.currency <> b.currency then rate end, (select auth.uid()))
    returning id into tx_id;
  end if;
  update public.recurring_bills set paid_until = due where id = b.id;
  return jsonb_build_object('paid_due', due, 'next_due', public.bill_next_due((select r from public.recurring_bills r where r.id = b.id)), 'transaction_id', tx_id);
end;
$$;
revoke all on function public.mark_bill_paid(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.mark_bill_paid(uuid, uuid, numeric, date) to authenticated;

-- Reminders, as notifications (the official bot sends DUE_DATE ones to linked chats with due alerts on).
alter table public.notifications add column if not exists bill_id uuid references public.recurring_bills (id) on delete cascade;
create unique index if not exists notifications_bill_alert_unique on public.notifications (bill_id, alert_key) where bill_id is not null;

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
  new_id uuid;
  n integer := 0;
begin
  for b in select * from public.recurring_bills where is_active loop
    due := public.bill_next_due(b);
    left_days := due - today;
    continue when not (left_days = 0 or left_days = any (b.remind_days));
    new_id := null;
    insert into public.notifications (workspace_id, bill_id, title, message, type, alert_key, scheduled_at)
    values (
      b.workspace_id, b.id,
      case when left_days = 0 then '🧾 ថ្ងៃនេះដល់ថ្ងៃបង់៖ ' || b.title else '🧾 ជិតដល់ថ្ងៃបង់ (' || translate(left_days::text, '0123456789', '០១២៣៤៥៦៧៨៩') || ' ថ្ងៃទៀត)៖ ' || b.title end,
      b.title || ' · ' || public.format_money_text(b.amount, b.currency) || ' · ថ្ងៃកំណត់ ' || to_char(due, 'DD/MM/YYYY')
        || case when b.kind = 'NSSF' then ' · សូមបង់ឱ្យទាន់ពេល ដើម្បីរក្សាសិទ្ធិ ប.ស.ស.' else ' · សូមបង់ឱ្យទាន់ពេល។' end,
      'DUE_DATE', 'BILL:' || due::text || ':' || left_days, now()
    )
    on conflict (bill_id, alert_key) where bill_id is not null do nothing
    returning id into new_id;
    if new_id is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_bill_alerts() from public, anon, authenticated;

-- Every morning (08:10 Cambodia time), like the debt and card reminders.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'luychlat-bill-alerts';
    perform cron.schedule('luychlat-bill-alerts', '10 1 * * *', 'select public.run_bill_alerts()');
  else
    raise warning 'pg_cron is not installed: bill reminders are not scheduled';
  end if;
end $$;

select public.apply_security_gate();
