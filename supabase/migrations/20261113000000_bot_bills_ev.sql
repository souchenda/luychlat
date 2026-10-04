-- Phase 3 follow-up: Telegram buttons on bill reminders (✅ paid / ⏰ remind
-- tomorrow), /nssf with the account's NSSF cards, and EV home-charging logs.

-- Bills: the wallet a bill is usually paid from, and a one-day snooze.
alter table public.recurring_bills add column if not exists wallet_id uuid references public.wallets_accounts (id) on delete set null;
alter table public.recurring_bills add column if not exists snooze_on date;

-- Paying from a wallet remembers it (for the Telegram ✅ button); paying clears a snooze.
do $$
declare
  def text := pg_get_functiondef('public.mark_bill_paid(uuid, uuid, numeric, date)'::regprocedure);
begin
  if position('snooze_on' in def) = 0 then
    def := replace(def, 'update public.recurring_bills set paid_until = due where id = b.id;',
      'update public.recurring_bills set paid_until = due, wallet_id = coalesce(p_wallet_id, wallet_id), snooze_on = null where id = b.id;');
    if position('snooze_on' in def) = 0 then
      raise exception 'mark_bill_paid: update not found';
    end if;
    execute def;
  end if;
end $$;

-- Reminders as before, plus a snoozed one on the snooze day.
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
        when left_days < 0 then '🧾 ហួសថ្ងៃកំណត់ (' || translate((-left_days)::text, '0123456789', '០១២៣៤៥៦៧៨៩') || ' ថ្ងៃ)៖ ' || b.title
        when left_days = 0 then '🧾 ថ្ងៃនេះដល់ថ្ងៃបង់៖ ' || b.title
        else '🧾 ជិតដល់ថ្ងៃបង់ (' || translate(left_days::text, '0123456789', '០១២៣៤៥៦៧៨៩') || ' ថ្ងៃទៀត)៖ ' || b.title
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

-- The bot's reminder queue now says which bill (and due date) a reminder is for.
drop function if exists public.bot_due_notifications(text, integer);
create or replace function public.bot_due_notifications(p_key text, p_limit integer default 100)
returns table (notification_id uuid, user_id uuid, chat_id bigint, language text, title text, message text, bill_id uuid, due date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select n.id, l.user_id, l.chat_id, l.language, n.title, n.message, n.bill_id,
           case when n.bill_id is not null then nullif(split_part(n.alert_key, ':', 2), '')::date end
    from public.notifications n
    join public.workspace_members wm on wm.workspace_id = n.workspace_id
    join public.telegram_links l on l.user_id = wm.user_id and l.debt_alerts
    where n.type = 'DUE_DATE'
      and n.created_at > now() - interval '2 days'
      and not exists (select 1 from public.telegram_deliveries d where d.notification_id = n.id and d.user_id = l.user_id)
    order by n.created_at
    limit least(greatest(p_limit, 1), 500);
end;
$$;
revoke all on function public.bot_due_notifications(text, integer) from public;
grant execute on function public.bot_due_notifications(text, integer) to anon, authenticated;

-- A reminder's buttons. 'paid': close that due date (if still the next one)
-- and, on a paid plan, log the expense from the bill's usual wallet (else the
-- first wallet in its currency). 'snooze': remind again tomorrow.
create or replace function public.bot_bill_action(p_key text, p_chat_id bigint, p_bill_id uuid, p_action text, p_due date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  b public.recurring_bills;
  due date;
  w public.wallets_accounts;
  rate numeric;
  logged boolean := false;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into b from public.recurring_bills where id = p_bill_id for update;
  if b.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(b.workspace_id) then
    return jsonb_build_object('status', 'not_writable');
  end if;

  if p_action = 'snooze' then
    update public.recurring_bills set snooze_on = (now() at time zone 'Asia/Phnom_Penh')::date + 1 where id = b.id;
    return jsonb_build_object('status', 'snoozed', 'title', b.title);
  end if;
  if p_action <> 'paid' then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  due := public.bill_next_due(b);
  if p_due is not null and due <> p_due then
    return jsonb_build_object('status', 'already', 'title', b.title, 'next_due', due);
  end if;
  if public.plan_code_of(link.uid) <> 'FREE' then
    select * into w from public.wallets_accounts x
    where x.workspace_id = b.workspace_id and x.archived_at is null
    order by (x.id = b.wallet_id) desc nulls last, (x.currency = b.currency) desc, x.created_at
    limit 1;
    if w.id is not null then
      select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = b.workspace_id;
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, exchange_rate, created_by)
      values (b.workspace_id, w.id, b.category_id, b.amount, b.currency, 'EXPENSE', now(), left(b.title, 500),
              case when w.currency <> b.currency then rate end, link.uid);
      logged := true;
    end if;
  end if;
  update public.recurring_bills set paid_until = due, snooze_on = null, wallet_id = coalesce(w.id, wallet_id) where id = b.id;
  return jsonb_build_object('status', 'paid', 'title', b.title, 'logged', logged, 'wallet', w.name,
    'amount', b.amount, 'currency', b.currency, 'next_due', public.bill_next_due((select r from public.recurring_bills r where r.id = b.id)),
    'plan_free', public.plan_code_of(link.uid) = 'FREE');
end;
$$;
revoke all on function public.bot_bill_action(text, bigint, uuid, text, date) from public;
grant execute on function public.bot_bill_action(text, bigint, uuid, text, date) to anon, authenticated;

-- /nssf: the account's own contributing NSSF members (names and IDs) for the linked chat.
create or replace function public.bot_nssf_members(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  perform public.require_bot(p_key);
  select l.user_id into uid from public.telegram_links l where l.chat_id = p_chat_id;
  if uid is null then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', m.name, 'relationship', m.relationship, 'nssf_id', m.nssf_id) order by m.created_at)
    from public.nssf_members m where m.user_id = uid and m.is_active
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.bot_nssf_members(text, bigint) from public;
grant execute on function public.bot_nssf_members(text, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- EV home charging: a usage log (kWh), never a wallet transaction — the cost
-- is in the electricity bill, so logging it as an expense would count it twice.
-- ---------------------------------------------------------------------------
create table if not exists public.ev_charge_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null default auth.uid(),
  place        text not null default 'HOME' check (place in ('HOME')),
  kwh          numeric(8, 2) check (kwh is null or (kwh > 0 and kwh <= 500)),
  note         text check (note is null or char_length(note) <= 200),
  charged_at   timestamptz not null default now()
);
create index if not exists ev_charge_logs_ws_idx on public.ev_charge_logs (workspace_id, charged_at desc);
alter table public.ev_charge_logs enable row level security;
drop policy if exists ev_charge_logs_select on public.ev_charge_logs;
create policy ev_charge_logs_select on public.ev_charge_logs for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists ev_charge_logs_insert on public.ev_charge_logs;
create policy ev_charge_logs_insert on public.ev_charge_logs for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists ev_charge_logs_delete on public.ev_charge_logs;
create policy ev_charge_logs_delete on public.ev_charge_logs for delete to authenticated using (public.can_write_workspace(workspace_id));
grant select, insert, delete on public.ev_charge_logs to authenticated;

-- From the bot (paid plans, like chat logging): returns this month's total kWh.
create or replace function public.bot_log_ev_home(p_key text, p_chat_id bigint, p_kwh numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if public.plan_code_of(link.uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  if not link.enabled then
    raise exception 'commands_off' using errcode = 'P0001';
  end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then
    raise exception 'not_writable' using errcode = '42501';
  end if;
  insert into public.ev_charge_logs (workspace_id, user_id, kwh, note) values (link.ws, link.uid, p_kwh, left(p_note, 200));
  return jsonb_build_object('status', 'ok',
    'month_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start),
    'month_count', (select count(*) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start));
end;
$$;
revoke all on function public.bot_log_ev_home(text, bigint, numeric, text) from public;
grant execute on function public.bot_log_ev_home(text, bigint, numeric, text) to anon, authenticated;

select public.apply_security_gate();
