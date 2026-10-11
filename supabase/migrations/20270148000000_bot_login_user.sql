-- «ចូលរហ័សជាមួយ Telegram»: the account whose Telegram is linked (telegram_links.chat_id = the
-- Telegram user's id — the private chat's id), for /api/auth/telegram once Telegram's own signature
-- is verified on the server. Only accounts that linked Telegram from inside the app can sign in this
-- way; nothing is created. Server only (the bot key).
create or replace function public.bot_login_user(p_key text, p_tg_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found record;
begin
  perform public.require_bot(p_key);
  select l.user_id, u.email into found
  from public.telegram_links l
  join auth.users u on u.id = l.user_id
  where l.chat_id = p_tg_id and u.deleted_at is null;
  if found.user_id is null or found.email is null then return jsonb_build_object('status', 'not_linked'); end if;
  return jsonb_build_object('status', 'ok', 'user_id', found.user_id, 'email', found.email);
end;
$$;
revoke all on function public.bot_login_user(text, bigint) from public;
grant execute on function public.bot_login_user(text, bigint) to anon, authenticated;
