-- Gift messages in the bot: wallets also carry their bank icon ("ACLEDA" finds a wallet
-- with the ACLEDA icon whatever its name), and the workspace name for the card.

create or replace function public.bot_gift_context(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if public.bot_tier(link.uid) = 'FREE' then
    return jsonb_build_object('status', 'plan_required');
  end if;
  if not coalesce(link.enabled, false) then
    return jsonb_build_object('status', 'commands_off');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then
    return jsonb_build_object('status', 'not_writable');
  end if;
  return jsonb_build_object('status', 'ok', 'workspace', (select name from public.workspaces where id = link.ws), 'wallets', coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'currency', w.currency, 'icon', w.icon) order by w.created_at)
    from public.wallets_accounts w
    where w.workspace_id = link.ws and w.archived_at is null and (w.visibility <> 'PERSONAL' or w.owner_id = link.uid)), '[]'::jsonb));
end;
$$;
revoke all on function public.bot_gift_context(text, bigint) from public;
grant execute on function public.bot_gift_context(text, bigint) to anon, authenticated;
