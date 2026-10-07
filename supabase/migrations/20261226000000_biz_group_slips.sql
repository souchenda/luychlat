-- Bank slips posted in a business group (founder, 2026-10-07): in a Telegram
-- group linked to a BUSINESS workspace (/biz link), a slip photo sent by one of
-- the group's Telegram admins (creator / administrator — checked by the bot
-- with getChatMember) is read and recorded straight into the workspace:
-- money out → an expense, money in → Sales income. The entry belongs to the
-- workspace owner who linked the group (as KHQR group payments do); the
-- sender's name is kept in the note as the audit trail ("👤 Mak Ravid").
--
-- Rules here: the group must be linked and the owner's plan allow groups; the
-- wallet and category must belong to the workspace; a photo is recorded once
-- (Telegram's file_unique_id per group). When the wallet isn't certain the bot
-- asks in the group — the slip waits in biz_slip_pending (1 day).

create table if not exists public.biz_slip_seen (
  chat_id        bigint not null,
  file_unique_id text not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (chat_id, file_unique_id)
);
alter table public.biz_slip_seen enable row level security;
revoke all on public.biz_slip_seen from anon, authenticated;

create table if not exists public.biz_slip_pending (
  id         uuid primary key default gen_random_uuid(),
  chat_id    bigint not null,
  action     jsonb not null,
  choices    jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default now() + interval '1 day',
  created_at timestamptz not null default now()
);
alter table public.biz_slip_pending enable row level security;
revoke all on public.biz_slip_pending from anon, authenticated;

-- The workspace behind a linked group: its wallets and categories (for matching), or null.
create or replace function public.bot_biz_slip_context(p_key text, p_group bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.biz_groups;
begin
  perform public.require_bot(p_key);
  select * into g from public.biz_groups where chat_id = p_group;
  if g.chat_id is null then return null; end if;
  return public.bot_workspace_payload(g.workspace_id, g.linked_by)
      || jsonb_build_object('allowed', public.biz_group_allowed(g.linked_by));
end;
$$;

-- A slip waiting for an admin to pick the wallet; returns its id.
create or replace function public.bot_biz_slip_pend(p_key text, p_group bigint, p_action jsonb, p_choices jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform public.require_bot(p_key);
  if not exists (select 1 from public.biz_groups where chat_id = p_group) then raise exception 'not_linked' using errcode = 'P0001'; end if;
  delete from public.biz_slip_pending where expires_at < now();
  insert into public.biz_slip_pending (chat_id, action, choices) values (p_group, p_action, p_choices) returning id into new_id;
  return new_id;
end;
$$;

-- Records a group slip (directly, or a pending one with the wallet an admin picked).
-- p_action: {kind EXPENSE|INCOME, wallet_id, category_id, amount, currency, note, date, receipt, file_unique_id}
create or replace function public.bot_biz_slip_record(p_key text, p_group bigint, p_action jsonb, p_pending uuid default null, p_choice int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.biz_groups;
  a jsonb := p_action;
  pend public.biz_slip_pending;
  w public.wallets_accounts;
  c public.categories;
  ws_name text;
  rate numeric;
  currency text;
  tx_type public.transaction_type;
  posted timestamptz;
  receipt text;
  tx_id uuid;
begin
  perform public.require_bot(p_key);
  select * into g from public.biz_groups where chat_id = p_group;
  if g.chat_id is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not public.biz_group_allowed(g.linked_by) then return jsonb_build_object('status', 'plan_required'); end if;

  if p_pending is not null then
    delete from public.biz_slip_pending where id = p_pending and chat_id = p_group and expires_at >= now() returning * into pend;
    if pend.id is null then return jsonb_build_object('status', 'expired'); end if;
    a := pend.action || jsonb_build_object('wallet_id', pend.choices ->> p_choice);
  end if;

  tx_type := (a ->> 'kind')::public.transaction_type;
  if tx_type not in ('EXPENSE', 'INCOME') or (a ->> 'amount')::numeric is null or (a ->> 'amount')::numeric <= 0
     or a ->> 'currency' not in ('USD', 'KHR') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select * into w from public.wallets_accounts where id = (a ->> 'wallet_id')::uuid and workspace_id = g.workspace_id and archived_at is null;
  if w.id is null then raise exception 'invalid_wallet' using errcode = '22023'; end if;
  select * into c from public.categories where id = (a ->> 'category_id')::uuid and workspace_id = g.workspace_id and type::text = a ->> 'kind';

  -- Once per photo in this group.
  if nullif(a ->> 'file_unique_id', '') is not null then
    insert into public.biz_slip_seen (chat_id, file_unique_id) values (p_group, a ->> 'file_unique_id') on conflict do nothing;
    if not found then return jsonb_build_object('status', 'duplicate'); end if;
  end if;

  select name, coalesce(khr_per_usd, 4000) into ws_name, rate from public.workspaces where id = g.workspace_id;
  currency := a ->> 'currency';
  begin
    posted := case
      when a ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then ((a ->> 'date') || ' 12:00')::timestamp at time zone 'Asia/Phnom_Penh'
      else (a ->> 'date')::timestamptz
    end;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then posted := now(); end if;
  receipt := case when a ->> 'receipt' ~ '^[A-Za-z0-9_-]{10,200}$' then g.linked_by::text || '/tg/' || (a ->> 'receipt') end;

  -- As the owner who linked the group (who also owns the books).
  perform public.bot_act_as(g.linked_by);
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, receipt_url)
  values (g.workspace_id, w.id, c.id, (a ->> 'amount')::numeric, currency::public.currency_code, tx_type,
          case when currency = w.currency::text then null else rate end, left(nullif(a ->> 'note', ''), 500), posted, receipt)
  returning id into tx_id;
  update public.biz_slip_seen set transaction_id = tx_id where chat_id = p_group and file_unique_id = a ->> 'file_unique_id';

  return jsonb_build_object('status', 'ok', 'tx_id', tx_id, 'workspace', ws_name, 'wallet', w.name, 'account_no', w.account_no, 'icon', w.icon,
    'category', c.name, 'preset', c.preset_key, 'amount', (a ->> 'amount')::numeric, 'currency', currency, 'kind', a ->> 'kind',
    'sender', a ->> 'sender');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_biz_slip_context(text, bigint)',
    'public.bot_biz_slip_pend(text, bigint, jsonb, jsonb)',
    'public.bot_biz_slip_record(text, bigint, jsonb, uuid, int)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
