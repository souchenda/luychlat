-- A slip's wallet in another of the person's workspaces (founder, 19/10/2026): an ABA slip from «DL USD
-- (016 824 222)» sent while the bot's default is Personal offers the business wallet «🏢 DL MEAT SUPPLY · DL USD
-- (016 824 222)» (lib/bot/bank-slip.ts resolveSlipAcrossWorkspaces). Picking it moves the pending entry into that
-- workspace — only one of the wallets offered, and only a workspace the bot may write to for this person
-- (bot_ws_allowed: their own writable workspace, routing on ULTRA). The entry is then recorded there by bot_confirm.

create or replace function public.bot_pending_wallet(p_key text, p_chat_id bigint, p_pending_id uuid, p_wallet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  link record;
  wallet_ws uuid;
begin
  perform public.require_bot(p_key);
  select action into a from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id and expires_at >= now();
  if a is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  -- Only one of the wallets the user was offered.
  if not coalesce(a -> 'wallet_choices' ? p_wallet_id::text, false) then
    raise exception 'invalid_wallet' using errcode = '22023';
  end if;
  select w.workspace_id into wallet_ws from public.wallets_accounts w where w.id = p_wallet_id and w.archived_at is null;
  if wallet_ws is null then raise exception 'invalid_wallet' using errcode = '22023'; end if;
  -- A wallet in another of the person's workspaces: the entry moves there, if the bot may write there for them.
  if wallet_ws is distinct from (a ->> 'workspace_id')::uuid then
    link := public.bot_chat_link(p_chat_id);
    if link.uid is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
    perform public.bot_act_as(link.uid);
    if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, wallet_ws) then
      raise exception 'not_writable' using errcode = '42501';
    end if;
    -- Categories and loans belong to a workspace: chosen again there.
    a := (a - 'category_id' - 'debt_id') || jsonb_build_object('workspace_id', wallet_ws, 'category_id', null);
  end if;
  update public.telegram_pending
     set action = (a - 'wallet_pending' - 'wallet_choices') || jsonb_build_object('wallet_id', p_wallet_id)
   where id = p_pending_id
  returning action into a;
  return jsonb_build_object('ok', true, 'action', a);
end;
$$;

revoke all on function public.bot_pending_wallet(text, bigint, uuid, uuid) from public;
grant execute on function public.bot_pending_wallet(text, bigint, uuid, uuid) to anon, authenticated;

select public.apply_security_gate();
