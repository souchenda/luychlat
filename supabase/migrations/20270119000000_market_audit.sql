-- Audit for market data.
-- 1) bot_admin_audit accepted only the gold override actions, so /setfuel, /setrate and the
--    poster broadcast were silently refused (the bot ignores the RPC's error). All are allowed now.
-- 2) bot_system_audit: what the server does on its own (the MoC fuel prices read from the
--    Ministry's notice), logged with no human actor.

create or replace function public.bot_admin_audit(p_key text, p_chat_id bigint, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  perform public.require_bot(p_key);
  if p_action not in ('SET_GOLD_OVERRIDE', 'CLEAR_GOLD_OVERRIDE', 'SET_FUEL_PRICES', 'SET_RATE_OVERRIDE', 'CLEAR_RATE_OVERRIDE', 'POSTER_BROADCAST') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  select l.user_id into v_admin from public.telegram_links l join public.app_admins a on a.user_id = l.user_id where l.chat_id = p_chat_id limit 1;
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  perform public.audit(p_action, null, concat_ws(' · ', p_note, 'via Telegram'), null, v_admin);
end;
$$;
revoke all on function public.bot_admin_audit(text, bigint, text, text) from public;
grant execute on function public.bot_admin_audit(text, bigint, text, text) to anon, authenticated;

create or replace function public.bot_system_audit(p_key text, p_action text, p_note text, p_ref text default null, p_metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_action not in ('AUTO_SET_FUEL_PRICES') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  perform public.audit(p_action, null, concat_ws(' · ', p_note, 'automatic'), p_ref, null, p_metadata);
end;
$$;
revoke all on function public.bot_system_audit(text, text, text, text, jsonb) from public;
grant execute on function public.bot_system_audit(text, text, text, text, jsonb) to anon, authenticated;

select public.apply_security_gate();
