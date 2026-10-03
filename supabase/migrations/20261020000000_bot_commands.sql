-- Phase C part 2: log expenses, income and debt payments by chatting with the
-- official bot (PRO, opt-in). The server parses the message and proposes an
-- action; nothing is written until the user presses ✅ on the confirmation card.
--
-- Telegram becomes a way to add records without the app's PIN or 2FA code, so
-- it is off until the user turns it on in Settings (commands_enabled). Every
-- check is done again when ✅ is pressed: link, opt-in, PRO, workspace write
-- access, and that the wallet / category / debt belong to that workspace.

alter table public.telegram_links add column if not exists commands_enabled boolean not null default false;
alter table public.telegram_links add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;
grant update (commands_enabled, workspace_id) on public.telegram_links to authenticated;

-- The chosen workspace must be one the user may write to.
create or replace function public.guard_telegram_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id is not null and new.workspace_id is distinct from old.workspace_id
     and not public.can_write_workspace(new.workspace_id) then
    raise exception 'workspace not writable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists telegram_links_guard_workspace on public.telegram_links;
create trigger telegram_links_guard_workspace
  before update of workspace_id on public.telegram_links
  for each row execute function public.guard_telegram_workspace();

create table if not exists public.telegram_pending (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  chat_id    bigint not null,
  action     jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index if not exists telegram_pending_chat_idx on public.telegram_pending (chat_id);
alter table public.telegram_pending enable row level security;
revoke all on public.telegram_pending from anon, authenticated;

-- Run the rest of the transaction as this user (auth.uid() in checks and
-- triggers, created_by on new rows). Internal only.
create or replace function public.bot_act_as(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
end;
$$;
revoke all on function public.bot_act_as(uuid) from public, anon, authenticated;

-- The link for a chat, with the workspace the bot writes to (default: Personal).
create or replace function public.bot_link_for(p_chat_id bigint, out uid uuid, out ws uuid, out enabled boolean, out lang text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select l.user_id, l.workspace_id, l.commands_enabled, l.language into uid, ws, enabled, lang
  from public.telegram_links l where l.chat_id = p_chat_id;
  if uid is not null and ws is null then
    select w.id into ws from public.workspaces w where w.user_id = uid and w.type = 'PERSONAL' limit 1;
  end if;
end;
$$;
revoke all on function public.bot_link_for(bigint) from public, anon, authenticated;

-- What the server needs to understand a message: wallets, categories, open debts.
create or replace function public.bot_context(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  rate numeric;
  ws_type text;
begin
  perform public.require_bot(p_key);
  link := public.bot_link_for(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('linked', false);
  end if;
  perform public.bot_act_as(link.uid);
  select w.type, coalesce(w.khr_per_usd, 4000) into ws_type, rate from public.workspaces w where w.id = link.ws;
  return jsonb_build_object(
    'linked', true,
    'pro', public.plan_code_of(link.uid) <> 'FREE',
    'enabled', link.enabled,
    'writable', link.ws is not null and public.can_write_workspace(link.ws),
    'language', link.lang,
    'workspace_type', ws_type,
    'rate', rate,
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'currency', w.currency, 'icon', w.icon, 'kind', w.kind, 'balance', w.balance) order by w.sort_order)
      from public.wallets_accounts w
      where w.workspace_id = link.ws and w.archived_at is null and w.goal_target is null
        and (w.visibility = 'SHARED' or w.owner_id is null or w.owner_id = link.uid)
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'type', c.type, 'preset_key', c.preset_key))
      from public.categories c where c.workspace_id = link.ws
    ), '[]'::jsonb),
    'debts', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'party_name', d.party_name, 'currency', d.currency, 'remaining', d.total_amount - d.paid_amount))
      from public.debts d where d.workspace_id = link.ws and d.status <> 'SETTLED'
    ), '[]'::jsonb)
  );
end;
$$;

-- Checks an action and keeps it until ✅ / ❌. Returns the pending id.
--   {kind: EXPENSE|INCOME, wallet_id, category_id?, amount, currency, note?}
--   {kind: REPAY, debt_id, wallet_id, amount, note?}
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
  new_id uuid;
begin
  perform public.require_bot(p_key);
  link := public.bot_link_for(p_chat_id);
  if link.uid is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  if kind not in ('EXPENSE', 'INCOME', 'REPAY') or amount is null or amount <= 0 or amount > 1e12 then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if not exists (select 1 from public.wallets_accounts w where w.id = (p_action ->> 'wallet_id')::uuid and w.workspace_id = link.ws and w.archived_at is null) then
    raise exception 'invalid_wallet' using errcode = '22023';
  end if;
  if kind = 'REPAY' then
    if not exists (select 1 from public.debts d where d.id = (p_action ->> 'debt_id')::uuid and d.workspace_id = link.ws and d.status <> 'SETTLED') then
      raise exception 'invalid_debt' using errcode = '22023';
    end if;
  else
    if (p_action ->> 'currency') not in ('USD', 'KHR') then raise exception 'invalid_action' using errcode = '22023'; end if;
    if (p_action ->> 'category_id') is not null and not exists (
      select 1 from public.categories c where c.id = (p_action ->> 'category_id')::uuid and c.workspace_id = link.ws and c.type::text = kind
    ) then
      raise exception 'invalid_category' using errcode = '22023';
    end if;
  end if;
  -- One open card per chat: a new message replaces the previous proposal.
  delete from public.telegram_pending where chat_id = p_chat_id or expires_at < now();
  insert into public.telegram_pending (user_id, chat_id, action) values (link.uid, p_chat_id, p_action || jsonb_build_object('workspace_id', link.ws))
  returning id into new_id;
  return new_id;
end;
$$;

-- ✅: write the record as the user, after checking everything again.
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
begin
  perform public.require_bot(p_key);
  delete from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id and expires_at >= now() returning * into p;
  if p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  link := public.bot_link_for(p_chat_id);
  if link.uid is distinct from p.user_id or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(p.user_id) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  a := p.action;
  ws := (a ->> 'workspace_id')::uuid;
  perform public.bot_act_as(p.user_id);
  if not public.can_write_workspace(ws) then raise exception 'not_writable' using errcode = '42501'; end if;

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
      'remaining', d.total_amount - d.paid_amount, 'debt_currency', d.currency, 'party', d.party_name);
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
  return jsonb_build_object('ok', true, 'kind', a ->> 'kind', 'wallet', w.name, 'balance', w.balance, 'wallet_currency', w.currency);
end;
$$;

-- ❌: drop the proposal.
create or replace function public.bot_cancel(p_key text, p_chat_id bigint, p_pending_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  delete from public.telegram_pending where id = p_pending_id and chat_id = p_chat_id;
  return found;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_context(text, bigint)',
    'public.bot_propose(text, bigint, jsonb)',
    'public.bot_confirm(text, bigint, uuid)',
    'public.bot_cancel(text, bigint, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
