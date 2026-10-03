-- Islamic Mode off = no Islamic content anywhere: the bot only sends prayer
-- times to people whose Islamic Lifestyle & Finance Mode is on. Their
-- prayer_alerts choice is kept, so turning the mode back on resumes them.
create or replace function public.bot_prayer_subscribers(p_key text)
returns table (user_id uuid, chat_id bigint, language text, province text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language, coalesce(l.prayer_province, 'phnom_penh')
    from public.telegram_links l
    join public.islamic_settings s on s.user_id = l.user_id and s.enabled
    where l.prayer_alerts;
end;
$$;
