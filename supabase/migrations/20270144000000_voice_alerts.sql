-- «🔔 សំឡេង Voice Telegram»: a business owner can ask the bot to send each KHQR sale as a spoken
-- Khmer voice note too ("pocket mode" — heard with the phone in a pocket). Off by default; /voice
-- toggles it. Only sales (the same guard as the SoundBox); the voice is joined from the recorded
-- Khmer clips on the server.
alter table public.telegram_links add column if not exists voice_alerts boolean not null default false;

-- The business owner's chats that want the voice note.
create or replace function public.bot_voice_alert_chats(p_key text, p_workspace_id uuid)
returns table (chat_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.chat_id
    from public.workspaces w
    join public.telegram_links l on l.user_id = w.user_id
    where w.id = p_workspace_id and w.type = 'BUSINESS' and l.voice_alerts;
end;
$$;
revoke all on function public.bot_voice_alert_chats(text, uuid) from public;
grant execute on function public.bot_voice_alert_chats(text, uuid) to anon, authenticated;

-- /voice on | off | (toggle): the linked chat's setting, returned.
create or replace function public.bot_set_voice_alerts(p_key text, p_chat_id bigint, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_on boolean;
begin
  perform public.require_bot(p_key);
  update public.telegram_links set voice_alerts = coalesce(p_on, not voice_alerts) where chat_id = p_chat_id
  returning voice_alerts into now_on;
  if now_on is null then return jsonb_build_object('status', 'not_linked'); end if;
  return jsonb_build_object('status', 'ok', 'on', now_on);
end;
$$;
revoke all on function public.bot_set_voice_alerts(text, bigint, boolean) from public;
grant execute on function public.bot_set_voice_alerts(text, bigint, boolean) to anon, authenticated;
