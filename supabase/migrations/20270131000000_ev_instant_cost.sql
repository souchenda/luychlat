-- EV charging, instant feedback (founder, 09/10): the logging answer carries the electricity rate
-- (the latest scanned bill's riel per kWh, else 730៛) and riel per dollar, so the bot shows this
-- session's cost and the month so far; /car and the public-charging summary get the same.

create or replace function public.bot_log_ev_home(p_key text, p_chat_id bigint, p_kwh numeric, p_note text,
                                                   p_photo text default null, p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_at timestamptz := now();
  v_photo text;
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
  -- The screenshot's own day (noon), when it shows one within the last 60 days.
  if p_day is not null and p_day <= today and p_day > today - 60 then
    v_at := (p_day::timestamp + time '12:00') at time zone 'Asia/Phnom_Penh';
  end if;
  v_photo := case when p_photo ~ '^[A-Za-z0-9_-]{10,200}$' then link.uid::text || '/tg/' || p_photo end;
  -- Logged already: this photo, or this day's same kWh (a screenshot sent again).
  if exists (
    select 1 from public.ev_charge_logs e
    where e.workspace_id = link.ws
      and ((v_photo is not null and e.photo_path = v_photo)
        or (p_day is not null and p_kwh is not null and e.kwh = p_kwh and (e.charged_at at time zone 'Asia/Phnom_Penh')::date = (v_at at time zone 'Asia/Phnom_Penh')::date))
  ) then
    return jsonb_build_object('status', 'duplicate', 'kwh', p_kwh, 'rate', (select coalesce((select s.rate from public.bill_statements s join public.recurring_bills b on b.id = s.bill_id
      where s.workspace_id = link.ws and b.kind = 'ELECTRICITY' and s.rate is not null and s.currency = 'KHR'
      order by s.created_at desc limit 1), 730)),
      'khr_per_usd', (select coalesce(khr_per_usd, 4000) from public.workspaces where id = link.ws),
      'month_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start),
      'month_count', (select count(*) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start));
  end if;
  insert into public.ev_charge_logs (workspace_id, user_id, kwh, note, charged_at, photo_path)
  values (link.ws, link.uid, p_kwh, left(p_note, 200), v_at, v_photo);
  return jsonb_build_object('status', 'ok', 'kwh', p_kwh, 'rate', (select coalesce((select s.rate from public.bill_statements s join public.recurring_bills b on b.id = s.bill_id
      where s.workspace_id = link.ws and b.kind = 'ELECTRICITY' and s.rate is not null and s.currency = 'KHR'
      order by s.created_at desc limit 1), 730)),
    'khr_per_usd', (select coalesce(khr_per_usd, 4000) from public.workspaces where id = link.ws),
    'month_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start),
    'month_count', (select count(*) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start));
end;
$$;
revoke all on function public.bot_log_ev_home(text, bigint, numeric, text, text, date) from public;
grant execute on function public.bot_log_ev_home(text, bigint, numeric, text, text, date) to anon, authenticated;

create or replace function public.bot_car_report(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  numbers boolean;
  rate numeric;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  kwh numeric;
  kwh_rate numeric;
  out jsonb;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  perform public.bot_act_as(link.uid);
  if not public.is_workspace_member(link.ws) then return jsonb_build_object('status', 'not_linked'); end if;
  select coalesce(t.ai_numbers, false) into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = link.ws;

  select coalesce(sum(e.kwh), 0) into kwh from public.ev_charge_logs e where e.workspace_id = link.ws and e.charged_at >= month_start;
  select s.rate into kwh_rate from public.bill_statements s join public.recurring_bills b on b.id = s.bill_id
  where s.workspace_id = link.ws and b.kind = 'ELECTRICITY' and s.rate is not null and s.currency = 'KHR'
  order by s.created_at desc limit 1;
  -- kWh, the electricity rate (else 730៛) and riel per dollar are always given: they are not account figures.
  out := jsonb_build_object('status', 'ok', 'numbers', coalesce(numbers, false), 'home_kwh', kwh, 'rate', coalesce(kwh_rate, 730), 'khr_per_usd', rate);
  if not coalesce(numbers, false) then return out; end if;


  with tx as (
    select t.amount, t.currency, w.icon, t.note
    from public.transactions t join public.wallets_accounts w on w.id = t.wallet_id
    where t.workspace_id = link.ws and t.type = 'EXPENSE' and t.transaction_date >= month_start
      and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = link.uid)
  )
  select out || jsonb_build_object(
    'home_khr', case when kwh_rate is not null then round(kwh * kwh_rate, 0) end,
    'public_usd', round(coalesce((select sum(case when currency = 'USD' then amount else amount / rate end) from tx
                                  where icon = 'prepaid_ev' or note like '%⚡ សាកភ្លើង EV%'), 0), 2),
    'toll_usd', round(coalesce((select sum(case when currency = 'USD' then amount else amount / rate end) from tx
                                where icon = 'prepaid_toll' or note like '%🛣️ ផ្លូវល្បឿនលឿន%'), 0), 2),
    'ev_balance', (select x.balance from public.wallets_accounts x where x.workspace_id = link.ws and x.icon = 'prepaid_ev' and x.archived_at is null order by x.created_at limit 1),
    'toll_balance', (select x.balance from public.wallets_accounts x where x.workspace_id = link.ws and x.icon = 'prepaid_toll' and x.archived_at is null order by x.created_at limit 1))
  into out;
  return out;
end;
$$;
revoke all on function public.bot_car_report(text, bigint) from public;
grant execute on function public.bot_car_report(text, bigint) to anon, authenticated;

select public.apply_security_gate();
