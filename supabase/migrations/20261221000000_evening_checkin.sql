-- Daily routine: an optional 20:00 "did you record today?" nudge in the bot.
--
-- telegram_links.evening_checkin — opt-in (off by default, like every reminder),
-- toggled by the user in Settings › Official bot (own row, RLS as for the other
-- switches). bot_evening_checkin_subscribers lists the chats to nudge: active,
-- not suspended, and nothing recorded by them today (Cambodia time) — someone
-- who already logged their day is left alone.

alter table public.telegram_links add column if not exists evening_checkin boolean not null default false;
grant update (evening_checkin) on public.telegram_links to authenticated;

create or replace function public.bot_evening_checkin_subscribers(p_key text)
returns table (user_id uuid, chat_id bigint, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language
    from public.telegram_links l
    join public.profiles pr on pr.id = l.user_id
    where l.evening_checkin
      and l.chat_id is not null
      and pr.account_status = 'ACTIVE'
      and not exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null)
      and not exists (select 1 from public.transactions t where t.created_by = l.user_id and t.created_at >= day_start);
end;
$$;

revoke all on function public.bot_evening_checkin_subscribers(text) from public;
grant execute on function public.bot_evening_checkin_subscribers(text) to anon, authenticated;

select public.apply_security_gate();
