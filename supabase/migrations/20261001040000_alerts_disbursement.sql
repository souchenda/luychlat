-- Phase 5: optional debt disbursement, Telegram settings, daily debt alerts.

-- ---------------------------------------------------------------------------
-- Optional money movement when a debt is created (once per debt):
--   PAYABLE    -> INCOME  "loan_received" into the wallet (borrowed funds)
--   RECEIVABLE -> EXPENSE "loan_given"   out of the wallet (lent funds)
-- The ledger row carries debt_id (so it is guarded like repayment rows) but
-- has no debt_repayments row, so it never counts as a repayment.
-- ---------------------------------------------------------------------------
alter table public.debts
  add column if not exists disbursement_transaction_id uuid unique references public.transactions (id) on delete set null;

create or replace function public.disburse_debt(
  p_debt_id uuid,
  p_wallet_id uuid,
  p_exchange_rate numeric,
  p_date timestamptz
)
returns public.transactions
language plpgsql
set search_path = ''
as $$
declare
  d public.debts;
  w public.wallets_accounts;
  category_id uuid;
  result public.transactions;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then
    raise exception 'debt not found' using errcode = 'P0002';
  end if;
  if d.disbursement_transaction_id is not null then
    raise exception 'debt already disbursed' using errcode = '22023';
  end if;
  select * into w from public.wallets_accounts where id = p_wallet_id and workspace_id = d.workspace_id;
  if not found then
    raise exception 'wallet not found in this workspace' using errcode = 'P0002';
  end if;

  if d.type = 'PAYABLE' then
    category_id := public.ensure_preset_category(d.workspace_id, 'loan_received', 'INCOME', 'landmark', '#6366f1', 'ប្រាក់ខ្ចីបានទទួល');
  else
    category_id := public.ensure_preset_category(d.workspace_id, 'loan_given', 'EXPENSE', 'hand-coins', '#f59e0b', 'ឱ្យគេខ្ចី');
  end if;

  insert into public.transactions (
    workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, debt_id
  ) values (
    d.workspace_id, w.id, category_id, d.total_amount, d.currency,
    case when d.type = 'PAYABLE' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
    case when w.currency = d.currency then null else p_exchange_rate end,
    d.party_name, coalesce(p_date, now()), d.id
  ) returning * into result;

  update public.debts set disbursement_transaction_id = result.id where id = d.id;
  return result;
end;
$$;
revoke all on function public.disburse_debt(uuid, uuid, numeric, timestamptz) from public, anon;
grant execute on function public.disburse_debt(uuid, uuid, numeric, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Telegram settings (one bot per user). Owner-only via RLS. The token is the
-- user's own bot token; it is used only by run_debt_alerts() below.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  bot_token  text not null check (bot_token ~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$'),
  chat_id    text not null check (chat_id ~ '^(-?[0-9]{3,20}|@[A-Za-z0-9_]{5,32})$'),
  enabled    boolean not null default true,
  language   text not null default 'km' check (language in ('km', 'en')),
  updated_at timestamptz not null default now()
);
alter table public.telegram_settings enable row level security;
drop policy if exists telegram_settings_owner on public.telegram_settings;
create policy telegram_settings_owner on public.telegram_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Alert stages, mirrored by src/lib/alerts.ts. Ranges (not exact days) so a
-- missed cron run still fires the stage; each stage fires once per debt.
--   D7: 4-7 days left · D3: 1-3 days · D0: due today · OVERDUE: past due
-- ---------------------------------------------------------------------------
create or replace function public.debt_alert_stage(p_due date, p_today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_due is null then null
    when p_due - p_today between 4 and 7 then 'D7'
    when p_due - p_today between 1 and 3 then 'D3'
    when p_due - p_today = 0 then 'D0'
    when p_due - p_today < 0 then 'OVERDUE'
  end;
$$;

alter table public.notifications
  add column if not exists alert_key text,
  drop constraint if exists notifications_debt_alert_unique,
  add constraint notifications_debt_alert_unique unique (debt_id, alert_key);

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.format_money_text(p_amount numeric, p_currency public.currency_code)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_currency = 'USD' then '$' || to_char(p_amount, 'FM999,999,999,990.00')
    else to_char(p_amount, 'FM999,999,999,990') || '៛'
  end;
$$;

-- Runs daily from pg_cron (as the job owner, hence SECURITY DEFINER). Creates
-- one in-app notification per debt and stage, and sends it to the owner's
-- Telegram bot when configured. Not callable by clients.
create or replace function public.run_debt_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  r record;
  stage text;
  days integer;
  left_amount numeric;
  lang text;
  title text;
  body text;
  safe_name text;
  new_id uuid;
  sent integer := 0;
begin
  -- Keep stored statuses fresh (OVERDUE depends on the date).
  update public.debts set paid_amount = paid_amount
  where status in ('ACTIVE', 'PARTIALLY_PAID') and due_date < current_date;

  for r in
    select d.*, ws.user_id, ts.bot_token, ts.chat_id, ts.enabled as tg_enabled, ts.language as tg_language
    from public.debts d
    join public.workspaces ws on ws.id = d.workspace_id
    left join public.telegram_settings ts on ts.user_id = ws.user_id
    where d.status <> 'SETTLED' and d.due_date is not null
  loop
    stage := public.debt_alert_stage(r.due_date, today);
    continue when stage is null;

    days := r.due_date - today;
    left_amount := r.total_amount - r.paid_amount;
    lang := coalesce(r.tg_language, 'km');
    safe_name := replace(replace(replace(r.party_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

    if lang = 'km' then
      title := case stage
        when 'OVERDUE' then '🔴 បំណុលហួសកំណត់'
        when 'D0' then '🔴 ដល់ថ្ងៃកំណត់ថ្ងៃនេះ'
        else '🟠 ជិតដល់ថ្ងៃកំណត់ (' || days || ' ថ្ងៃទៀត)'
      end;
      body := case when r.type = 'PAYABLE' then '📤 ត្រូវសងគេ: ' else '📥 គេជំពាក់យើង: ' end || safe_name
        || E'\n💰 នៅខ្វះ: ' || public.format_money_text(left_amount, r.currency)
        || ' / ' || public.format_money_text(r.total_amount, r.currency)
        || E'\n📅 ថ្ងៃកំណត់: ' || to_char(r.due_date, 'DD/MM/YYYY');
    else
      title := case stage
        when 'OVERDUE' then '🔴 Debt overdue'
        when 'D0' then '🔴 Due today'
        else '🟠 Due soon (' || days || ' days left)'
      end;
      body := case when r.type = 'PAYABLE' then '📤 I owe: ' else '📥 Owed to me: ' end || safe_name
        || E'\n💰 Remaining: ' || public.format_money_text(left_amount, r.currency)
        || ' of ' || public.format_money_text(r.total_amount, r.currency)
        || E'\n📅 Due: ' || to_char(r.due_date, 'DD/MM/YYYY');
    end if;

    new_id := null;
    insert into public.notifications (workspace_id, debt_id, title, message, type, alert_key, scheduled_at)
    values (r.workspace_id, r.id, title, body, 'DUE_DATE', stage, now())
    on conflict (debt_id, alert_key) do nothing
    returning id into new_id;

    if new_id is not null and r.bot_token is not null and r.tg_enabled then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || r.bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', r.chat_id,
          'parse_mode', 'HTML',
          'text', '<b>' || title || E'</b>\n' || body || E'\n\n— លុយឆ្លាត · LuyChlat'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function public.run_debt_alerts() from public, anon, authenticated;

-- 01:00 UTC = 08:00 in Phnom Penh (guideline 4.3).
select cron.schedule('luysmart-debt-alerts', '0 1 * * *', $$select public.run_debt_alerts()$$);
