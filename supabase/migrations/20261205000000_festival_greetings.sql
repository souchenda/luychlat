-- Festival greetings: on the first day of a major festival (New Year, Chinese
-- New Year, Khmer New Year, Pchum Ben, Water Festival) the bot sends one wish
-- at 08:00 to every linked chat whose account is active. Buddhist festivals
-- skip people who use Islamic Mode. Once per festival via bot_claim_daily.

create or replace function public.bot_festival_people(p_key text, p_buddhist boolean)
returns table (chat_id bigint, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.chat_id, l.language
    from public.telegram_links l
    join public.profiles pr on pr.id = l.user_id
    where pr.account_status = 'ACTIVE'
      and not exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null)
      and not (p_buddhist and exists (select 1 from public.islamic_settings s where s.user_id = l.user_id and s.enabled));
end;
$$;

revoke all on function public.bot_festival_people(text, boolean) from public;
grant execute on function public.bot_festival_people(text, boolean) to anon, authenticated;
