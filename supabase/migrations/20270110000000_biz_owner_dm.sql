-- Bank groups stay clean: LuyChlat no longer replies in a business's KHQR / bank
-- groups — each recorded payment goes to the business owner privately instead
-- (their own chat with the bot, telegram_links). The owner, found by the
-- business or by one of its linked groups.
create or replace function public.bot_biz_owner_chats(p_key text, p_workspace_id uuid default null, p_group bigint default null)
returns table (chat_id bigint, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws uuid := p_workspace_id;
begin
  perform public.require_bot(p_key);
  if ws is null and p_group is not null then
    select g.workspace_id into ws from public.biz_groups g where g.chat_id = p_group;
  end if;
  if ws is null then return; end if;
  return query
    select l.chat_id, l.language
    from public.workspaces w
    join public.telegram_links l on l.user_id = w.user_id
    where w.id = ws and w.type = 'BUSINESS';
end;
$$;
revoke all on function public.bot_biz_owner_chats(text, uuid, bigint) from public;
grant execute on function public.bot_biz_owner_chats(text, uuid, bigint) to anon, authenticated;

select public.apply_security_gate();
