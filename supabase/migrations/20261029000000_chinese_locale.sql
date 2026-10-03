-- Simplified Chinese (zh) as a third language: the official bot can talk to a
-- linked chat in Chinese, chosen in Settings › Telegram or with /lang zh.

alter table public.telegram_links drop constraint if exists telegram_links_language_check;
alter table public.telegram_links add constraint telegram_links_language_check check (language in ('km', 'en', 'zh'));

-- /lang km | en | zh from a linked chat. True when the chat is linked.
create or replace function public.bot_set_language(p_key text, p_chat_id bigint, p_language text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_bot(p_key);
  if p_language not in ('km', 'en', 'zh') then
    raise exception 'invalid language' using errcode = '22023';
  end if;
  update public.telegram_links set language = p_language where chat_id = p_chat_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.bot_set_language(text, bigint, text) from public;
grant execute on function public.bot_set_language(text, bigint, text) to anon, authenticated;
