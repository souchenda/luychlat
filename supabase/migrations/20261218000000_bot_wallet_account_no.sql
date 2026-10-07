-- Bank slips: the bot's wallet list carries each wallet's account number, so a
-- slip from "016 824 222" books to the wallet with that number, not to the first
-- ACLEDA KHR wallet. Server side only (the payload is never returned to clients,
-- and the bot masks 8+ digit numbers in anything it sends).

create or replace function public.bot_workspace_payload(p_ws uuid, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'type', w.type,
    'rate', coalesce(w.khr_per_usd, 4000),
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'currency', a.currency, 'icon', a.icon, 'kind', a.kind, 'balance', a.balance, 'account_no', a.account_no) order by a.sort_order)
      from public.wallets_accounts a
      where a.workspace_id = w.id and a.archived_at is null and a.goal_target is null
        and (a.visibility = 'SHARED' or a.owner_id is null or a.owner_id = p_user)
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'type', c.type, 'preset_key', c.preset_key))
      from public.categories c where c.workspace_id = w.id
    ), '[]'::jsonb),
    'debts', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'party_name', d.party_name, 'currency', d.currency, 'remaining', d.total_amount - d.paid_amount))
      from public.debts d where d.workspace_id = w.id and d.status <> 'SETTLED'
    ), '[]'::jsonb)
  )
  from public.workspaces w where w.id = p_ws;
$$;
revoke all on function public.bot_workspace_payload(uuid, uuid) from public, anon, authenticated;
