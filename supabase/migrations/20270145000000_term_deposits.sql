-- Fixed / term deposits read from a bank app screenshot (src/lib/bot/term-deposit.ts):
--   * the deposit becomes a savings-goal wallet: balance = principal, goal = the maturity amount by
--     the maturity date (shown on /wallets, /goals and in net worth);
--   * a DEPOSIT reminder on /bills for the maturity date (7, 3 and 1 day before, and on the day) —
--     money coming back, so its wording is "matures", never "pay", and it has no «បង់រួច» button.

do $$
declare
  c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.recurring_bills'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ELECTRICITY%' loop
    execute format('alter table public.recurring_bills drop constraint %I', c);
  end loop;
end $$;
alter table public.recurring_bills add constraint recurring_bills_kind_check
  check (kind in ('ELECTRICITY', 'WATER', 'INTERNET', 'RENT', 'WASTE', 'LOAN', 'NSSF', 'OTHER', 'DEPOSIT'));

-- Bill reminders; a deposit's say when it matures (and never "overdue" — the money is paid out).
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
  deposit boolean;
begin
  for b in select * from public.recurring_bills where is_active and debt_id is null loop
    deposit := b.kind = 'DEPOSIT';
    due := public.bill_next_due(b);
    left_days := due - today;
    snoozed := b.snooze_on = today;
    continue when not (left_days = 0 or left_days = any (b.remind_days) or snoozed);
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
        || case when snoozed and not (left_days = 0 or left_days = any (b.remind_days)) then 'snz' || today::text else left_days::text end,
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

-- A deposit's reminder carries no bill buttons (nothing to pay or snooze).
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
    select n.id, l.user_id, l.chat_id, l.language, n.title, n.message,
           case when n.alert_key like 'DEPOSIT:%' then null else n.bill_id end,
           case when n.bill_id is not null and n.alert_key like 'BILL:%' then nullif(split_part(n.alert_key, ':', 2), '')::date end
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

-- The bot's import: the goal wallet and the maturity reminder in the chat's workspace, once per account.
-- p_dep: bank, account_last4, wallet_name, currency, principal, maturity_amount, maturity_date, icon.
create or replace function public.bot_term_deposit(p_key text, p_chat_id bigint, p_dep jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  d jsonb := p_dep;
  existing uuid;
  wallet uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then raise exception 'not_writable' using errcode = '42501'; end if;

  select id into existing from public.wallets_accounts
  where workspace_id = link.ws and archived_at is null and name = left(d->>'wallet_name', 60);
  if existing is not null then
    return jsonb_build_object('status', 'duplicate', 'wallet_id', existing, 'workspace', (select name from public.workspaces where id = link.ws));
  end if;

  -- An existing deposit arrives with its principal (as an import does); goal wallets otherwise start empty.
  perform set_config('luysmart.import', 'on', true);
  insert into public.wallets_accounts (workspace_id, name, currency, balance, icon, goal_target, goal_date, owner_id)
  values (link.ws, left(d->>'wallet_name', 60), (d->>'currency')::public.currency_code, (d->>'principal')::numeric,
    nullif(d->>'icon', ''), nullif(d->>'maturity_amount', '')::numeric, (d->>'maturity_date')::date, link.uid)
  returning id into wallet;
  perform set_config('luysmart.import', 'off', true);

  -- No paying wallet: a deposit's reminder is never «paid» from anything.
  insert into public.recurring_bills (workspace_id, title, kind, amount, currency, frequency, due_date, remind_days)
  values (link.ws, left(d->>'wallet_name', 80), 'DEPOSIT', coalesce(nullif(d->>'maturity_amount', '')::numeric, (d->>'principal')::numeric),
    (d->>'currency')::public.currency_code, 'YEARLY', (d->>'maturity_date')::date, '{7,3,1}');

  return jsonb_build_object('status', 'ok', 'wallet_id', wallet, 'workspace', (select name from public.workspaces where id = link.ws));
end;
$$;
revoke all on function public.bot_term_deposit(text, bigint, jsonb) from public;
grant execute on function public.bot_term_deposit(text, bigint, jsonb) to anon, authenticated;
