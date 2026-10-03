-- ULTRA: log into any of your workspaces from one chat ("កត់ត្រាបានទាំងអស់").
-- With route_all on, the server routes each message by a workspace name or tag
-- in it ("DL សាំង 20$" → DL MEAT SUPPLY), defaulting to Personal, and the card
-- has buttons to switch the target before ✅. Every check is repeated on ✅:
-- still ULTRA, route_all still on, and write access to that workspace.

alter table public.telegram_links add column if not exists route_all boolean not null default false;
grant update (route_all) on public.telegram_links to authenticated;

-- Internal: the user's plan tier (FREE / PRO / ULTRA).
create or replace function public.bot_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.tier from public.plans p where p.code = public.plan_code_of(p_user)), 'FREE');
$$;
revoke all on function public.bot_tier(uuid) from public, anon, authenticated;

-- Internal: one workspace's wallets, categories and open debts for the parser.
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'currency', a.currency, 'icon', a.icon, 'kind', a.kind, 'balance', a.balance) order by a.sort_order)
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

-- Internal: true when this chat may write to p_ws (its default workspace, or any
-- writable one with ULTRA + route_all). Call after bot_act_as.
create or replace function public.bot_ws_allowed(p_user uuid, p_default uuid, p_route_all boolean, p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_ws is not null
     and public.can_write_workspace(p_ws)
     and (p_ws = p_default or (p_route_all and public.bot_tier(p_user) = 'ULTRA'));
$$;
revoke all on function public.bot_ws_allowed(uuid, uuid, boolean, uuid) from public, anon, authenticated;

-- The link for a chat (bot_link_for plus route_all, which counts only on ULTRA). With routing the default is Personal.
create or replace function public.bot_chat_link(p_chat_id bigint, out uid uuid, out ws uuid, out enabled boolean, out lang text, out route_all boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select l.user_id, l.workspace_id, l.commands_enabled, l.language, l.route_all into uid, ws, enabled, lang, route_all
  from public.telegram_links l where l.chat_id = p_chat_id;
  -- Routing is an ULTRA feature: after a downgrade the chat goes back to its one chosen workspace.
  route_all := coalesce(route_all, false) and uid is not null and public.bot_tier(uid) = 'ULTRA';
  if uid is not null and (ws is null or route_all) then
    select w.id into ws from public.workspaces w where w.user_id = uid and w.type = 'PERSONAL' limit 1;
  end if;
end;
$$;
revoke all on function public.bot_chat_link(bigint) from public, anon, authenticated;

create or replace function public.bot_context(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  tier text;
  routing boolean;
  base jsonb;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('linked', false);
  end if;
  perform public.bot_act_as(link.uid);
  tier := public.bot_tier(link.uid);
  routing := link.route_all and tier = 'ULTRA';
  base := coalesce(public.bot_workspace_payload(link.ws, link.uid), '{}'::jsonb);
  return jsonb_build_object(
    'linked', true,
    'pro', tier <> 'FREE',
    'ultra', tier = 'ULTRA',
    'route_all', routing,
    'enabled', link.enabled,
    'writable', link.ws is not null and public.can_write_workspace(link.ws),
    'language', link.lang,
    'workspace_id', link.ws,
    'workspace_type', base ->> 'type',
    'rate', coalesce((base ->> 'rate')::numeric, 4000),
    'wallets', coalesce(base -> 'wallets', '[]'::jsonb),
    'categories', coalesce(base -> 'categories', '[]'::jsonb),
    'debts', coalesce(base -> 'debts', '[]'::jsonb),
    -- Every workspace this chat can log into: Personal first, then by type and age.
    'workspaces', case when routing then coalesce((
      select jsonb_agg(public.bot_workspace_payload(w.id, link.uid) order by (w.id = link.ws) desc, w.type, w.created_at)
      from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id and m.user_id = link.uid and m.role in ('OWNER', 'MEMBER')
      where w.archived_at is null and public.can_write_workspace(w.id)
    ), '[]'::jsonb) else jsonb_build_array(base) end
  );
end;
$$;

-- action.workspace_id picks the target (ULTRA + route_all); otherwise the chat's workspace.
create or replace function public.bot_propose(p_key text, p_chat_id bigint, p_action jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  kind text := p_action ->> 'kind';
  amount numeric := (p_action ->> 'amount')::numeric;
  target uuid;
  new_id uuid;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  perform public.bot_act_as(link.uid);
  target := coalesce((p_action ->> 'workspace_id')::uuid, link.ws);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, target) then
    raise exception 'not_writable' using errcode = '42501';
  end if;
  if kind not in ('EXPENSE', 'INCOME', 'REPAY') or amount is null or amount <= 0 or amount > 1e12 then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if not exists (select 1 from public.wallets_accounts w where w.id = (p_action ->> 'wallet_id')::uuid and w.workspace_id = target and w.archived_at is null) then
    raise exception 'invalid_wallet' using errcode = '22023';
  end if;
  if kind = 'REPAY' then
    if not exists (select 1 from public.debts d where d.id = (p_action ->> 'debt_id')::uuid and d.workspace_id = target and d.status <> 'SETTLED') then
      raise exception 'invalid_debt' using errcode = '22023';
    end if;
  else
    if (p_action ->> 'currency') not in ('USD', 'KHR') then raise exception 'invalid_action' using errcode = '22023'; end if;
    if (p_action ->> 'category_id') is not null and not exists (
      select 1 from public.categories c where c.id = (p_action ->> 'category_id')::uuid and c.workspace_id = target and c.type::text = kind
    ) then
      raise exception 'invalid_category' using errcode = '22023';
    end if;
  end if;
  -- One open card per chat: a new message (or a workspace switch) replaces the previous proposal.
  delete from public.telegram_pending where chat_id = p_chat_id or expires_at < now();
  insert into public.telegram_pending (user_id, chat_id, action)
  values (link.uid, p_chat_id, p_action || jsonb_build_object('workspace_id', target))
  returning id into new_id;
  return new_id;
end;
$$;

-- The pending action behind a card (to switch its workspace).
create or replace function public.bot_pending(p_key text, p_chat_id bigint, p_pending_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return (select p.action from public.telegram_pending p where p.id = p_pending_id and p.chat_id = p_chat_id and p.expires_at >= now());
end;
$$;

-- ✅: as before, plus the target workspace must still be allowed for this chat.
create or replace function public.bot_confirm(p_key text, p_chat_id bigint, p_pending_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.telegram_pending;
  link record;
  a jsonb;
  ws uuid;
  w public.wallets_accounts;
  d public.debts;
  rate numeric;
  currency text;
  tx_type public.transaction_type;
  ws_name text;
begin
  perform public.require_bot(p_key);
  delete from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id and expires_at >= now() returning * into p;
  if p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  link := public.bot_chat_link(p_chat_id);
  if link.uid is distinct from p.user_id or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(p.user_id) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  a := p.action;
  ws := (a ->> 'workspace_id')::uuid;
  perform public.bot_act_as(p.user_id);
  if not public.bot_ws_allowed(p.user_id, link.ws, link.route_all, ws) then raise exception 'not_writable' using errcode = '42501'; end if;
  select name into ws_name from public.workspaces where id = ws;

  select * into w from public.wallets_accounts where id = (a ->> 'wallet_id')::uuid and workspace_id = ws and archived_at is null;
  if w.id is null then raise exception 'invalid_wallet' using errcode = '22023'; end if;
  if w.visibility = 'PERSONAL' and w.owner_id is not null and w.owner_id <> p.user_id then raise exception 'invalid_wallet' using errcode = '42501'; end if;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = ws;

  if a ->> 'kind' = 'REPAY' then
    select * into d from public.debts where id = (a ->> 'debt_id')::uuid and workspace_id = ws;
    if d.id is null then raise exception 'invalid_debt' using errcode = '22023'; end if;
    perform public.record_debt_repayment(d.id, w.id, (a ->> 'amount')::numeric, rate, now(), nullif(a ->> 'note', ''));
    select * into d from public.debts where id = d.id;
    select * into w from public.wallets_accounts where id = w.id;
    return jsonb_build_object('ok', true, 'kind', 'REPAY', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency,
      'remaining', d.total_amount - d.paid_amount, 'debt_currency', d.currency, 'party', d.party_name, 'workspace', ws_name);
  end if;

  currency := a ->> 'currency';
  tx_type := (a ->> 'kind')::public.transaction_type;
  if (a ->> 'category_id') is not null and not exists (
    select 1 from public.categories c where c.id = (a ->> 'category_id')::uuid and c.workspace_id = ws and c.type::text = a ->> 'kind'
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date)
  values (ws, w.id, (a ->> 'category_id')::uuid, (a ->> 'amount')::numeric, currency::public.currency_code, tx_type,
          case when currency = w.currency::text then null else rate end, left(nullif(a ->> 'note', ''), 500), now());
  select * into w from public.wallets_accounts where id = w.id;
  return jsonb_build_object('ok', true, 'kind', a ->> 'kind', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency, 'workspace', ws_name);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_context(text, bigint)',
    'public.bot_propose(text, bigint, jsonb)',
    'public.bot_pending(text, bigint, uuid)',
    'public.bot_confirm(text, bigint, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
