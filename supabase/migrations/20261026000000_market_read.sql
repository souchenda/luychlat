-- The server reads back the stored market data (after a restart, and to merge
-- an admin's /setgold): app_settings is readable by signed-in users only, and
-- the server has no user session, so it reads through the bot key like the
-- rest of its functions.
create or replace function public.bot_get_market(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return (select s.value from public.app_settings s where s.key = 'market_live');
end;
$$;
revoke all on function public.bot_get_market(text) from public;
grant execute on function public.bot_get_market(text) to anon, authenticated;
