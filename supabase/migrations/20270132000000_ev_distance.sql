-- EV driving economics (founder, 10/10): the car's distance — odometer readings ("គីឡូឡាន 15200")
-- or trips ("ចម្ងាយ 120 គម") — so /car and the app show cost per km and the saving against a
-- petrol car. The month's km = the latest odometer this month − the last reading before it
-- (else the month's first), plus the month's trips.

create table if not exists public.vehicle_distance_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null default auth.uid(),
  kind         text not null check (kind in ('ODOMETER', 'TRIP')),
  km           numeric(10, 1) not null check (km > 0 and km < 2000000),
  note         text check (note is null or char_length(note) <= 200),
  logged_at    timestamptz not null default now()
);
create index if not exists vehicle_distance_logs_ws_idx on public.vehicle_distance_logs (workspace_id, logged_at desc);
alter table public.vehicle_distance_logs enable row level security;
revoke all on public.vehicle_distance_logs from anon;
grant select, insert, delete on public.vehicle_distance_logs to authenticated;
drop policy if exists vehicle_distance_select on public.vehicle_distance_logs;
create policy vehicle_distance_select on public.vehicle_distance_logs for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists vehicle_distance_insert on public.vehicle_distance_logs;
create policy vehicle_distance_insert on public.vehicle_distance_logs for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists vehicle_distance_delete on public.vehicle_distance_logs;
create policy vehicle_distance_delete on public.vehicle_distance_logs for delete to authenticated using (public.can_write_workspace(workspace_id));

-- The month's kilometres (from month_start).
create or replace function public.car_month_km(p_ws uuid, p_month_start timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with odo as (
    select max(km) filter (where logged_at >= p_month_start) as now_km,
           min(km) filter (where logged_at >= p_month_start) as first_km,
           (select d.km from public.vehicle_distance_logs d where d.workspace_id = p_ws and d.kind = 'ODOMETER' and d.logged_at < p_month_start order by d.logged_at desc limit 1) as before_km
    from public.vehicle_distance_logs where workspace_id = p_ws and kind = 'ODOMETER'
  )
  select greatest(0, coalesce((select case when now_km is null then 0 when before_km is not null then now_km - before_km else now_km - first_km end from odo), 0))
       + coalesce((select sum(km) from public.vehicle_distance_logs where workspace_id = p_ws and kind = 'TRIP' and logged_at >= p_month_start), 0);
$$;
revoke all on function public.car_month_km(uuid, timestamptz) from public, anon, authenticated;

-- The app's EV card: this month's figures for a workspace the user is in.
create or replace function public.car_month(p_ws uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  rate numeric;
begin
  if uid is null or not public.is_workspace_member(p_ws) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p_ws;
  return jsonb_build_object(
    'home_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = p_ws and charged_at >= month_start),
    'rate', coalesce((select s.rate from public.bill_statements s join public.recurring_bills b on b.id = s.bill_id
              where s.workspace_id = p_ws and b.kind = 'ELECTRICITY' and s.rate is not null and s.currency = 'KHR' order by s.created_at desc limit 1), 730),
    'public_usd', round(coalesce((select sum(case when t.currency = 'USD' then t.amount else t.amount / rate end)
       from public.transactions t join public.wallets_accounts w on w.id = t.wallet_id
       where t.workspace_id = p_ws and t.type = 'EXPENSE' and t.transaction_date >= month_start
         and (w.visibility <> 'PERSONAL' or w.owner_id is null or w.owner_id = uid)
         and (w.icon = 'prepaid_ev' or t.note like '%⚡ សាកភ្លើង EV%')), 0), 2),
    'khr_per_usd', rate,
    'month_km', public.car_month_km(p_ws, month_start));
end;
$$;
revoke all on function public.car_month(uuid) from public, anon;
grant execute on function public.car_month(uuid) to authenticated;

-- The bot: "គីឡូឡាន 15200" / "ចម្ងាយ 120 គម". An odometer lower than the last reading is refused.
create or replace function public.bot_log_distance(p_key text, p_chat_id bigint, p_kind text, p_km numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  last_km numeric;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then raise exception 'not_writable' using errcode = '42501'; end if;
  if p_kind not in ('ODOMETER', 'TRIP') or p_km is null or p_km <= 0 then return jsonb_build_object('status', 'invalid'); end if;
  if p_kind = 'ODOMETER' then
    select km into last_km from public.vehicle_distance_logs where workspace_id = link.ws and kind = 'ODOMETER' order by logged_at desc limit 1;
    if last_km is not null and p_km < last_km then return jsonb_build_object('status', 'lower', 'last_km', last_km); end if;
  end if;
  insert into public.vehicle_distance_logs (workspace_id, user_id, kind, km, note) values (link.ws, link.uid, p_kind, p_km, left(p_note, 200));
  return jsonb_build_object('status', 'ok', 'month_km', public.car_month_km(link.ws, month_start), 'last_km', last_km);
end;
$$;
revoke all on function public.bot_log_distance(text, bigint, text, numeric, text) from public;
grant execute on function public.bot_log_distance(text, bigint, text, numeric, text) to anon, authenticated;

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
  out := jsonb_build_object('status', 'ok', 'numbers', coalesce(numbers, false), 'home_kwh', kwh, 'rate', coalesce(kwh_rate, 730), 'khr_per_usd', rate,
    'month_km', public.car_month_km(link.ws, month_start));
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
