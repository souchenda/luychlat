-- Buddhist holy-day (ថ្ងៃសីល) reminders in Telegram: opt-in per chat; the
-- server works out the days from the Khmer lunar calendar and sends the
-- evening before (18:00 Cambodia), once per holy day.

alter table public.telegram_links add column if not exists holy_day_alerts boolean not null default false;
grant update (holy_day_alerts) on public.telegram_links to authenticated;

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
    where l.holy_day_alerts
      and not exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null);
end;
$$;
revoke all on function public.bot_holy_day_subscribers(text) from public;
grant execute on function public.bot_holy_day_subscribers(text) to anon, authenticated;
