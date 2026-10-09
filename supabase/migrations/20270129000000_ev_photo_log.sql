-- Home EV charging from a photo (founder, 09/10): a photo captioned "សាកឡាននៅផ្ទះ 56.9kwh", or a
-- car / charger screenshot read by Vision, logs the kWh with the photo kept as evidence, on the
-- day it shows. The same screenshot twice (or the same day and kWh again) is logged once.

alter table public.ev_charge_logs add column if not exists photo_path text
  check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/tg/[A-Za-z0-9_-]{10,200}$');

drop function if exists public.bot_log_ev_home(text, bigint, numeric, text);

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
    return jsonb_build_object('status', 'duplicate', 'kwh', p_kwh,
      'month_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start),
      'month_count', (select count(*) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start));
  end if;
  insert into public.ev_charge_logs (workspace_id, user_id, kwh, note, charged_at, photo_path)
  values (link.ws, link.uid, p_kwh, left(p_note, 200), v_at, v_photo);
  return jsonb_build_object('status', 'ok', 'kwh', p_kwh,
    'month_kwh', (select coalesce(sum(kwh), 0) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start),
    'month_count', (select count(*) from public.ev_charge_logs where workspace_id = link.ws and charged_at >= month_start));
end;
$$;
revoke all on function public.bot_log_ev_home(text, bigint, numeric, text, text, date) from public;
grant execute on function public.bot_log_ev_home(text, bigint, numeric, text, text, date) to anon, authenticated;

select public.apply_security_gate();
