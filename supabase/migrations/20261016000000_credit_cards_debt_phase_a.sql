-- Phase A: credit-card wallets, card due-date alerts, Qard Hasan / doubtful
-- debts, debt photos (PRO), the Zakat "subtract debts I owe" switch and the
-- user's own KHQR image for payment reminders.

-- ---------------------------------------------------------------------------
-- Credit cards: a wallet whose balance is what you owe (negative). Spending
-- on it is an ordinary expense; paying the bill is a transfer into it, so it
-- is never counted twice.
-- ---------------------------------------------------------------------------
alter table public.wallets_accounts add column if not exists kind text not null default 'STANDARD';
alter table public.wallets_accounts add column if not exists credit_limit numeric(18, 2);
alter table public.wallets_accounts add column if not exists statement_day smallint;
alter table public.wallets_accounts add column if not exists due_day smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_kind_check') then
    alter table public.wallets_accounts add constraint wallets_kind_check check (kind in ('STANDARD', 'CREDIT_CARD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wallets_credit_card_check') then
    alter table public.wallets_accounts add constraint wallets_credit_card_check check (
      (kind = 'STANDARD' and credit_limit is null and statement_day is null and due_day is null)
      or (kind = 'CREDIT_CARD' and credit_limit > 0 and statement_day between 1 and 31 and due_day between 1 and 31 and goal_target is null)
    );
  end if;
end $$;

grant update (kind, credit_limit, statement_day, due_day) on public.wallets_accounts to authenticated;

-- Transfers may take a card below zero, down to minus its limit (a cash
-- advance or a transfer out); other wallets still stop at zero.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.adjust_wallet_balances(public.transactions, integer)'::regprocedure);
  if position('CREDIT_CARD' in def) = 0 then
    def := replace(
      def,
      'select 1 from public.wallets_accounts where id = t.wallet_id and balance < 0',
      'select 1 from public.wallets_accounts where id = t.wallet_id
      and balance < case when kind = ''CREDIT_CARD'' then -credit_limit else 0 end'
    );
    if position('CREDIT_CARD' in def) = 0 then
      raise exception 'adjust_wallet_balances: balance check not found';
    end if;
    execute def;
  end if;
end $$;

-- Next payment due date of a card, on or after p_today. The bill closes on
-- statement_day; it is due on due_day of the same month when due_day comes
-- later, else of the next month. Days past a month's end use its last day.
create or replace function public.card_day(p_year integer, p_month integer, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  -- p_month may run past 12 or below 1 (next / previous year).
  select make_date(y, m, least(p_day, extract(day from (make_date(y, m, 1) + interval '1 month - 1 day'))::integer))
  from (
    select p_year + floor((p_month - 1) / 12.0)::integer as y,
           (((p_month - 1) % 12) + 12) % 12 + 1 as m
  ) s
$$;

create or replace function public.card_next_due(p_statement_day integer, p_due_day integer, p_today date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  y integer := extract(year from p_today)::integer;
  m integer := extract(month from p_today)::integer;
  k integer;
  stmt date;
  due date;
begin
  -- Statements from last month onwards; the first due date not yet past.
  for k in -1..2 loop
    stmt := public.card_day(y, m + k, p_statement_day);
    due := public.card_day(
      extract(year from stmt)::integer,
      extract(month from stmt)::integer + case when p_due_day > p_statement_day then 0 else 1 end,
      p_due_day
    );
    if due >= p_today then
      return due;
    end if;
  end loop;
  return null;
end;
$$;

-- Card alerts reuse public.notifications: keyed by wallet + due date + stage.
alter table public.notifications add column if not exists wallet_id uuid references public.wallets_accounts (id) on delete cascade;
create unique index if not exists notifications_wallet_alert_unique on public.notifications (wallet_id, alert_key) where wallet_id is not null;

create or replace function public.run_card_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  r record;
  due date;
  stage text;
  lang text;
  title text;
  body text;
  safe_name text;
  new_id uuid;
  sent integer := 0;
begin
  for r in
    select w.*, ws.user_id, ts.bot_token, ts.chat_id, ts.enabled as tg_enabled, ts.language as tg_language
    from public.wallets_accounts w
    join public.workspaces ws on ws.id = w.workspace_id
    left join public.telegram_settings ts on ts.user_id = ws.user_id
    where w.kind = 'CREDIT_CARD' and w.archived_at is null and w.balance < 0
  loop
    due := public.card_next_due(r.statement_day, r.due_day, today);
    continue when due is null;
    stage := case due - today when 3 then 'D3' when 0 then 'D0' else null end;
    continue when stage is null;

    lang := coalesce(r.tg_language, 'km');
    safe_name := replace(replace(replace(r.name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    if lang = 'km' then
      title := case stage when 'D0' then '🔔 ប័ណ្ណឥណទានដល់ថ្ងៃបង់ថ្ងៃនេះ' else '🔔 ប័ណ្ណឥណទានជិតដល់ថ្ងៃបង់ (៣ ថ្ងៃទៀត)' end;
      body := 'កាបូបប័ណ្ណឥណទាន ' || safe_name || ' មានបំណុលត្រូវសង ' || public.format_money_text(-r.balance, r.currency)
        || ' ដល់ថ្ងៃកំណត់នៅថ្ងៃទី ' || to_char(due, 'DD/MM/YYYY')
        || '! សូមបង់ផ្ដាច់ឱ្យបានទាន់ពេល ដើម្បីជៀសវាងការប្រាក់ធនាគារ។';
    else
      title := case stage when 'D0' then '🔔 Credit card payment due today' else '🔔 Credit card payment due in 3 days' end;
      body := safe_name || ' has ' || public.format_money_text(-r.balance, r.currency) || ' to pay by '
        || to_char(due, 'DD/MM/YYYY') || '. Pay it in full on time to avoid bank interest.';
    end if;

    new_id := null;
    insert into public.notifications (workspace_id, wallet_id, title, message, type, alert_key, scheduled_at)
    values (r.workspace_id, r.id, title, body, 'DUE_DATE', 'CC:' || due::text || ':' || stage, now())
    on conflict (wallet_id, alert_key) where wallet_id is not null do nothing
    returning id into new_id;

    if new_id is not null and r.bot_token is not null and r.tg_enabled then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || r.bot_token || '/sendMessage',
        body := jsonb_build_object('chat_id', r.chat_id, 'parse_mode', 'HTML',
          'text', '<b>' || title || E'</b>\n' || body || E'\n\n— លុយឆ្លាត · LuyChlat'),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function public.run_card_alerts() from public, anon, authenticated;

-- Same daily slot as the debt alerts (08:00 Phnom Penh), when pg_cron is there.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('luychlat-card-alerts', '5 1 * * *', 'select public.run_card_alerts()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Debts: Qard Hasan (interest-free loan), doubtful receivables (left out of
-- Zakat until repaid), and up to two photos (contract, IOU, receipt). Photos
-- are a PRO feature.
-- ---------------------------------------------------------------------------
alter table public.debts add column if not exists qard_hasan boolean not null default false;
alter table public.debts add column if not exists doubtful boolean not null default false;
alter table public.debts add column if not exists attachment_paths text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'debts_qard_hasan_check') then
    alter table public.debts add constraint debts_qard_hasan_check check (not qard_hasan or coalesce(interest_rate, 0) = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debts_attachments_check') then
    alter table public.debts add constraint debts_attachments_check check (cardinality(attachment_paths) <= 2);
  end if;
end $$;

grant update (qard_hasan, doubtful, attachment_paths) on public.debts to authenticated;

create or replace function public.guard_debt_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p text;
begin
  if uid is null then
    return new;
  end if;
  -- Only new photos are checked: removing one is always allowed.
  if tg_op = 'UPDATE' and new.attachment_paths <@ old.attachment_paths then
    return new;
  end if;
  if cardinality(new.attachment_paths) = 0 then
    return new;
  end if;
  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  foreach p in array new.attachment_paths loop
    if tg_op = 'INSERT' or not p = any (old.attachment_paths) then
      -- receipts/<uploader>/<file>: only your own uploads can be attached.
      if split_part(p, '/', 1) <> uid::text then
        raise exception 'attachment must be your own upload' using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists debts_guard_attachments on public.debts;
create trigger debts_guard_attachments
  before insert or update of attachment_paths on public.debts
  for each row execute function public.guard_debt_attachments();

-- Family members of the workspace may view a debt's photos.
drop policy if exists receipts_select_debt on storage.objects;
create policy receipts_select_debt on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.debts d
      where objects.name = any (d.attachment_paths) and public.is_workspace_member(d.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Zakat: subtracting debts you owe is the Hanafi / AAOIFI approach; in the
-- Shafi'i school (most of Cambodia) debts don't reduce Zakat. Off by default.
-- ---------------------------------------------------------------------------
alter table public.islamic_settings add column if not exists subtract_debts boolean not null default false;

-- ---------------------------------------------------------------------------
-- The user's own KHQR image (profile-images bucket, user/<id>/…), attached to
-- payment reminders they send.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists khqr_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_khqr_path_check') then
    alter table public.profiles add constraint profiles_khqr_path_check
      check (khqr_path is null or khqr_path like 'user/' || id::text || '/%');
  end if;
end $$;
grant update (khqr_path) on public.profiles to authenticated;

select public.apply_security_gate();
