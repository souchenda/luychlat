-- Telegram: a bank account / savings screenshot (e.g. Chip Mong «Kmeng Chhlat») → one tap adds it as a
-- wallet (its balance as the opening balance) or a savings goal (the target typed in reply; the goal
-- starts at 0, as in the app — the money is moved in from a wallet). The reading is kept here between
-- the photo and the tap, for one day, for that chat only.

create table if not exists public.bot_pending_accounts (
  id          uuid primary key default gen_random_uuid(),
  chat_id     bigint not null,
  payload     jsonb not null,
  prompt_msg  bigint,
  created_at  timestamptz not null default now()
);
alter table public.bot_pending_accounts enable row level security;
revoke all on public.bot_pending_accounts from anon, authenticated;

-- Returns the reading's id and whether this chat shows numbers (telegram_links.ai_numbers — the bot
-- never shows a balance otherwise).
create or replace function public.bot_account_pending_save(p_key text, p_chat_id bigint, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  perform public.require_bot(p_key);
  delete from public.bot_pending_accounts where created_at < now() - interval '1 day';
  insert into public.bot_pending_accounts (chat_id, payload) values (p_chat_id, p_payload) returning id into new_id;
  return jsonb_build_object('id', new_id, 'show_numbers', coalesce((select l.ai_numbers from public.telegram_links l where l.chat_id = p_chat_id limit 1), false));
end;
$$;

-- The «type the goal amount» prompt, so the reply finds its reading.
create or replace function public.bot_account_pending_prompt(p_key text, p_chat_id bigint, p_id uuid, p_msg bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.bot_pending_accounts set prompt_msg = p_msg where id = p_id and chat_id = p_chat_id;
end;
$$;

create or replace function public.bot_account_by_prompt(p_key text, p_chat_id bigint, p_msg bigint)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found uuid;
begin
  perform public.require_bot(p_key);
  select id into found from public.bot_pending_accounts where chat_id = p_chat_id and prompt_msg = p_msg;
  return found;
end;
$$;

create or replace function public.bot_account_pending_get(p_key text, p_chat_id bigint, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb;
begin
  perform public.require_bot(p_key);
  select payload into p from public.bot_pending_accounts where id = p_id and chat_id = p_chat_id;
  return p;
end;
$$;

create or replace function public.bot_account_dismiss(p_key text, p_chat_id bigint, p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  delete from public.bot_pending_accounts where id = p_id and chat_id = p_chat_id;
end;
$$;

-- Add the reading to the chat's workspace: p_as 'WALLET' (opening balance = the screen's balance) or
-- 'GOAL' (p_target > 0, balance 0). Statuses: ok | duplicate (same account number already there) |
-- gone (already added or expired) | limit (the plan's wallet limit) | not_linked.
create or replace function public.bot_account_add(p_key text, p_chat_id bigint, p_id uuid, p_as text, p_target numeric default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  link record;
  p jsonb;
  existing uuid;
  new_id uuid;
  acct text;
begin
  perform public.require_bot(p_key);
  if p_as not in ('WALLET', 'GOAL') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_as = 'GOAL' and (p_target is null or p_target <= 0 or p_target >= 1e12) then raise exception 'bad target' using errcode = '22023'; end if;
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select payload into p from public.bot_pending_accounts where id = p_id and chat_id = p_chat_id;
  if p is null then return jsonb_build_object('status', 'gone'); end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then raise exception 'not_writable' using errcode = '42501'; end if;

  acct := nullif(p->>'account_no', '');
  if acct is not null then
    select id into existing from public.wallets_accounts
    where workspace_id = link.ws and archived_at is null and regexp_replace(account_no, '[^0-9]', '', 'g') = regexp_replace(acct, '[^0-9]', '', 'g')
    limit 1;
    if existing is not null then
      delete from public.bot_pending_accounts where id = p_id;
      return jsonb_build_object('status', 'duplicate', 'wallet_id', existing);
    end if;
  end if;

  begin
    insert into public.wallets_accounts (workspace_id, name, balance, currency, icon, account_no, goal_target, kind, sort_order)
    values (
      link.ws,
      left(p->>'name', 60),
      case when p_as = 'WALLET' then coalesce((p->>'balance')::numeric, 0) else 0 end,
      (p->>'currency')::public.currency_code,
      nullif(p->>'icon', ''),
      acct,
      case when p_as = 'GOAL' then round(p_target, 2) end,
      'STANDARD',
      coalesce((select max(sort_order) + 1 from public.wallets_accounts where workspace_id = link.ws), 0)
    )
    returning id into new_id;
  exception when others then
    if sqlerrm ilike '%limit%' then return jsonb_build_object('status', 'limit'); end if;
    raise;
  end;
  delete from public.bot_pending_accounts where id = p_id;
  return jsonb_build_object('status', 'ok', 'wallet_id', new_id, 'name', left(p->>'name', 60));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_account_pending_save(text, bigint, jsonb)',
    'public.bot_account_pending_prompt(text, bigint, uuid, bigint)',
    'public.bot_account_by_prompt(text, bigint, bigint)',
    'public.bot_account_pending_get(text, bigint, uuid)',
    'public.bot_account_dismiss(text, bigint, uuid)',
    'public.bot_account_add(text, bigint, uuid, text, numeric)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
