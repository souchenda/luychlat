-- Utility bill statements: one per month's paper bill, read by OCR (/api/bills/ocr) —
-- invoice, customer ID, usage (kWh / m³), rate, amount, due date — under its recurring
-- bill (whose amount follows the latest statement, so reminders show this month's bill).
-- Paying the bill (mark_bill_paid, the bot's ✅ បានបង់រួច) moves paid_until past the
-- statement's due date, which marks the statement PAID. The usage history drives the
-- energy chart.

create table if not exists public.bill_statements (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.recurring_bills (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  due_date      date,
  amount        numeric(15, 2) not null check (amount > 0),
  currency      public.currency_code not null default 'KHR',
  usage         numeric(12, 2) check (usage is null or usage >= 0),
  rate          numeric(12, 2) check (rate is null or rate > 0),
  invoice_no    text check (invoice_no is null or char_length(invoice_no) <= 40),
  customer_id   text check (customer_id is null or char_length(customer_id) <= 40),
  customer_name text check (customer_name is null or char_length(customer_name) <= 60),
  location      text check (location is null or char_length(location) <= 80),
  provider      text check (provider is null or char_length(provider) <= 80),
  status        text not null default 'PENDING' check (status in ('PENDING', 'PAID')),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (bill_id, invoice_no)
);
create index if not exists bill_statements_bill_idx on public.bill_statements (bill_id, due_date desc);
alter table public.bill_statements enable row level security;

drop policy if exists bill_statements_select on public.bill_statements;
create policy bill_statements_select on public.bill_statements
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists bill_statements_insert on public.bill_statements;
create policy bill_statements_insert on public.bill_statements
  for insert to authenticated with check (
    public.can_write_workspace(workspace_id)
    and exists (select 1 from public.recurring_bills b where b.id = bill_id and b.workspace_id = bill_statements.workspace_id));
drop policy if exists bill_statements_update on public.bill_statements;
create policy bill_statements_update on public.bill_statements
  for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
drop policy if exists bill_statements_delete on public.bill_statements;
create policy bill_statements_delete on public.bill_statements
  for delete to authenticated using (public.can_write_workspace(workspace_id));
grant select, insert, update, delete on public.bill_statements to authenticated;

-- Paid up to a date → the statements due by then are paid.
create or replace function public.bill_statements_mark_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paid_until is not null and new.paid_until is distinct from old.paid_until then
    update public.bill_statements
       set status = 'PAID'
     where bill_id = new.id and status = 'PENDING' and (due_date is null or due_date <= new.paid_until + 15);
  end if;
  return null;
end;
$$;
drop trigger if exists recurring_bills_statements_paid on public.recurring_bills;
create trigger recurring_bills_statements_paid after update of paid_until on public.recurring_bills
  for each row execute function public.bill_statements_mark_paid();

-- Reset my data / delete account: statements go with their bills (cascade).
