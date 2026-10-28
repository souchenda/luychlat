-- «🚨 My phone is lost» (founder, 28/10/2026): one tap, from any phone or computer the person signs in on, closes every
-- door the lost phone still has —
--   • every other sign-in ends (super admins too: their several devices are not protected by the one-device rule);
--   • the Telegram bot is unlinked: whoever holds the phone can no longer record in the book through the bot, nor ask it
--     anything (the numbers permission goes with the link);
--   • audited. Signing in on the new phone, then linking Telegram again, takes a minute.
create or replace function public.secure_lost_phone()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_sessions integer;
  v_telegram integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.session_alive() then
    raise exception 'session_revoked' using errcode = '42501';
  end if;
  delete from auth.sessions where user_id = uid and id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics v_sessions = row_count;
  delete from public.telegram_links where user_id = uid;
  get diagnostics v_telegram = row_count;
  perform public.audit('LOST_PHONE', uid, null, format('sessions=%s telegram=%s', v_sessions, v_telegram));
  return jsonb_build_object('sessions', v_sessions, 'telegram', v_telegram);
end;
$$;
revoke all on function public.secure_lost_phone() from public, anon;
grant execute on function public.secure_lost_phone() to authenticated;
