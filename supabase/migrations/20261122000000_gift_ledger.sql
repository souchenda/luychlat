-- Gift & merit ledger (សៀវភៅចំណងដៃ & បច្ច័យបុណ្យ): what we gave and received
-- at weddings, housewarmings, merit ceremonies, funerals, birthdays…, so the
-- two-way history with each person is at hand when the next invitation comes.
-- Optionally the money is also an entry in a wallet (expense when given,
-- income when received); deleting the gift removes that entry too.
-- Other people's names and phones stay in the app (never sent to the bot or AI).

create table if not exists public.gift_ledger (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  direction      text not null check (direction in ('given', 'received')),
  person_name    text not null check (char_length(btrim(person_name)) between 1 and 255),
  phone_number   text check (phone_number is null or char_length(phone_number) <= 50),
  event_type     text not null default 'other' check (event_type in ('wedding', 'housewarming', 'monk_merit', 'funeral', 'birthday', 'other')),
  event_title    text check (event_title is null or char_length(event_title) <= 255),
  amount         numeric(15, 2) not null check (amount > 0 and amount < 1e12),
  currency       public.currency_code not null default 'USD',
  event_date     date not null default ((now() at time zone 'Asia/Phnom_Penh')::date),
  wallet_id      uuid references public.wallets_accounts (id) on delete set null,
  transaction_id uuid unique references public.transactions (id) on delete set null,
  notes          text check (notes is null or char_length(notes) <= 1000),
  created_at     timestamptz not null default now()
);
create index if not exists gift_ledger_workspace_idx on public.gift_ledger (workspace_id, event_date desc);
create index if not exists gift_ledger_person_idx on public.gift_ledger (workspace_id, lower(btrim(person_name)));
alter table public.gift_ledger enable row level security;

drop policy if exists gift_ledger_select on public.gift_ledger;
create policy gift_ledger_select on public.gift_ledger for select to authenticated using (public.is_workspace_member(workspace_id));
-- Details may be edited directly; the money (amount, currency, wallet) only through add / delete.
drop policy if exists gift_ledger_update on public.gift_ledger;
create policy gift_ledger_update on public.gift_ledger for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
revoke insert, update, delete on public.gift_ledger from anon, authenticated;
grant select on public.gift_ledger to authenticated;
grant update (person_name, phone_number, event_type, event_title, event_date, notes) on public.gift_ledger to authenticated;

create or replace function public.add_gift(
  p_workspace_id uuid, p_direction text, p_person text, p_phone text, p_event_type text, p_title text,
  p_amount numeric, p_currency public.currency_code, p_date date, p_wallet_id uuid default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  w public.wallets_accounts;
  category_id uuid;
  tx_id uuid;
  gift_id uuid;
  rate numeric;
begin
  if uid is null or not public.can_write_workspace(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_direction not in ('given', 'received') or p_amount is null or p_amount <= 0 then
    raise exception 'invalid gift' using errcode = '22023';
  end if;
  if p_wallet_id is not null then
    select * into w from public.wallets_accounts
    where id = p_wallet_id and workspace_id = p_workspace_id and archived_at is null
      and (visibility <> 'PERSONAL' or owner_id = uid);
    if w.id is null then
      raise exception 'invalid wallet' using errcode = '22023';
    end if;
    select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p_workspace_id;
    category_id := case when p_direction = 'given'
      then public.ensure_preset_category(p_workspace_id, 'gift_given', 'EXPENSE', 'gift', '#e11d48', 'ចំណងដៃ & បច្ច័យ')
      else public.ensure_preset_category(p_workspace_id, 'gift_received', 'INCOME', 'gift', '#e11d48', 'អំណោយ / ចំណងដៃទទួល') end;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
    values (p_workspace_id, w.id, category_id, round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency,
            case when p_direction = 'given' then 'EXPENSE'::public.transaction_type else 'INCOME'::public.transaction_type end,
            case when p_currency <> w.currency then rate end,
            left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), btrim(p_person)), 500),
            coalesce(p_date::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours', now()), uid)
    returning id into tx_id;
  end if;
  insert into public.gift_ledger (workspace_id, created_by, direction, person_name, phone_number, event_type, event_title, amount, currency, event_date, wallet_id, transaction_id, notes)
  values (p_workspace_id, uid, p_direction, left(btrim(p_person), 255), left(nullif(btrim(coalesce(p_phone, '')), ''), 50),
          coalesce(p_event_type, 'other'), left(nullif(btrim(coalesce(p_title, '')), ''), 255),
          round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency,
          coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date), w.id, tx_id, left(nullif(btrim(coalesce(p_notes, '')), ''), 1000))
  returning id into gift_id;
  return gift_id;
end;
$$;
revoke all on function public.add_gift(uuid, text, text, text, text, text, numeric, public.currency_code, date, uuid, text) from public, anon;
grant execute on function public.add_gift(uuid, text, text, text, text, text, numeric, public.currency_code, date, uuid, text) to authenticated;

-- Delete a gift and the wallet entry it made.
create or replace function public.delete_gift(p_gift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.gift_ledger;
begin
  select * into g from public.gift_ledger where id = p_gift_id;
  if g.id is null or not public.can_write_workspace(g.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.gift_ledger where id = g.id;
  if g.transaction_id is not null then
    delete from public.transactions where id = g.transaction_id;
  end if;
end;
$$;
revoke all on function public.delete_gift(uuid) from public, anon;
grant execute on function public.delete_gift(uuid) to authenticated;

select public.apply_security_gate();

-- ---------------------------------------------------------------------------
-- Telegram: "ចងដៃការ បងសុខា 50$ ABA" → a card with ✅ / ❌; /gift សុខា → the
-- two-way history. PRO with "Log by chat" on, in the chat's workspace.
-- ---------------------------------------------------------------------------
create table if not exists public.bot_gift_pending (
  id         uuid primary key default gen_random_uuid(),
  chat_id    bigint not null,
  payload    jsonb not null check (pg_column_size(payload) < 4000),
  created_at timestamptz not null default now()
);
alter table public.bot_gift_pending enable row level security;
revoke all on public.bot_gift_pending from anon, authenticated;

-- What the chat may do: status + its workspace and wallets (names only) for the parser.
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
  return jsonb_build_object('status', 'ok', 'wallets', coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'currency', w.currency) order by w.created_at)
    from public.wallets_accounts w
    where w.workspace_id = link.ws and w.archived_at is null and (w.visibility <> 'PERSONAL' or w.owner_id = link.uid)), '[]'::jsonb));
end;
$$;
revoke all on function public.bot_gift_context(text, bigint) from public;
grant execute on function public.bot_gift_context(text, bigint) to anon, authenticated;

create or replace function public.bot_gift_propose(p_key text, p_chat_id bigint, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  id uuid;
begin
  perform public.require_bot(p_key);
  delete from public.bot_gift_pending where created_at < now() - interval '1 day';
  insert into public.bot_gift_pending (chat_id, payload) values (p_chat_id, p_payload) returning bot_gift_pending.id into id;
  return id;
end;
$$;
revoke all on function public.bot_gift_propose(text, bigint, jsonb) from public;
grant execute on function public.bot_gift_propose(text, bigint, jsonb) to anon, authenticated;

-- ✅ / ❌ on the card. ✅ saves through add_gift as the linked user (all checks again).
create or replace function public.bot_gift_decide(p_key text, p_chat_id bigint, p_pending_id uuid, p_save boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  pending public.bot_gift_pending;
  g jsonb;
  gift_id uuid;
begin
  perform public.require_bot(p_key);
  delete from public.bot_gift_pending where id = p_pending_id and chat_id = p_chat_id returning * into pending;
  if pending.id is null then
    return jsonb_build_object('status', 'expired');
  end if;
  if not p_save then
    return jsonb_build_object('status', 'cancelled');
  end if;
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null or public.bot_tier(link.uid) = 'FREE' or not coalesce(link.enabled, false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  perform public.bot_act_as(link.uid);
  g := pending.payload;
  gift_id := public.add_gift(link.ws, g ->> 'direction', g ->> 'person', null, g ->> 'event_type', g ->> 'title',
                             (g ->> 'amount')::numeric, (g ->> 'currency')::public.currency_code, null,
                             nullif(g ->> 'wallet_id', '')::uuid, null);
  return jsonb_build_object('status', 'saved', 'gift_id', gift_id);
end;
$$;
revoke all on function public.bot_gift_decide(text, bigint, uuid, boolean) from public;
grant execute on function public.bot_gift_decide(text, bigint, uuid, boolean) to anon, authenticated;

-- /gift <name>: every entry with that person in the chat's workspace (newest first).
create or replace function public.bot_gift_lookup(p_key text, p_chat_id bigint, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  q text := lower(btrim(coalesce(p_name, '')));
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
  if char_length(q) < 2 then
    return jsonb_build_object('status', 'short');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.is_workspace_member(link.ws) then
    return jsonb_build_object('status', 'not_linked');
  end if;
  return jsonb_build_object('status', 'ok', 'entries', coalesce((
    select jsonb_agg(jsonb_build_object('direction', g.direction, 'person', g.person_name, 'event_type', g.event_type, 'title', g.event_title,
                                        'amount', g.amount, 'currency', g.currency, 'date', g.event_date) order by g.event_date desc, g.created_at desc)
    from (select * from public.gift_ledger x
          where x.workspace_id = link.ws and position(q in lower(x.person_name)) > 0
          order by x.event_date desc limit 40) g), '[]'::jsonb));
end;
$$;
revoke all on function public.bot_gift_lookup(text, bigint, text) from public;
grant execute on function public.bot_gift_lookup(text, bigint, text) to anon, authenticated;

select public.apply_security_gate();
