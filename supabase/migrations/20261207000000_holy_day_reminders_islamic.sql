-- Eve reminders (holy days, festivals, Khmer-Chinese offering days) stay opt-in
-- (holy_day_alerts) and are muted for people who use Islamic Mode and for
-- accounts that are not active (dormant / deleted).

create or replace function public.bot_holy_day_subscribers(p_key text)
returns table (user_id uuid, chat_id bigint, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language
    from public.telegram_links l
    join public.profiles pr on pr.id = l.user_id
    where l.holy_day_alerts
      and pr.account_status = 'ACTIVE'
      and not exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null)
      and not exists (select 1 from public.islamic_settings s where s.user_id = l.user_id and s.enabled);
end;
$$;

revoke all on function public.bot_holy_day_subscribers(text) from public;
grant execute on function public.bot_holy_day_subscribers(text) to anon, authenticated;
