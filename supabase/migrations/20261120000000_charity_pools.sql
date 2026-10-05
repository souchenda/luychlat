-- Shared pools, part 2: CHARITY (សប្បុរសធម៌ / social fund) and receipt photos from Telegram.
--   * kind CHARITY: receipt photos public by default; the keeper's KHQR always on
--     the public page ("open for donations").
--   * Telegram photos: /spend with a photo (caption), or a photo sent as a reply
--     to the bot's receipt card, is attached to that expense as
--     <keeper>/tg/<file id>. The app and the public page show it through a
--     server route that fetches it from Telegram — only for someone who can see
--     the entry, or on a shared pool with photos on.
-- Idempotent; old app versions keep working while both run (blue / green).

alter table public.pools drop constraint if exists pools_kind_check;
alter table public.pools add constraint pools_kind_check check (kind in ('FESTIVAL', 'FAMILY', 'TRIP', 'GENERAL', 'CHARITY'));

-- Which single-expense card in a group belongs to which entry (for photo replies).
create table if not exists public.pool_tg_messages (
  chat_id        bigint not null,
  message_id     bigint not null,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (chat_id, message_id)
);
alter table public.pool_tg_messages enable row level security;
revoke all on public.pool_tg_messages from anon, authenticated;

create or replace function public.create_pool(
  p_workspace_id uuid, p_kind text, p_title text, p_currency public.currency_code, p_split text,
  p_members jsonb, p_target numeric default null, p_start date default null, p_end date default null, p_record_paid boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  wallet_id uuid;
  pool_id uuid;
  e jsonb;
  i integer := 0;
  member_id uuid;
  pledged numeric;
  total numeric := 0;
begin
  if uid is null or not public.can_write_workspace(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.plan_code_of(uid) = 'FREE'
     and exists (select 1 from public.pools where created_by = uid and status = 'active') then
    raise exception 'plan_limit:pools' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 1 and 100 then
    raise exception 'members must be 1–100' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(p_members) loop
    pledged := coalesce((e ->> 'pledged')::numeric, 0);
    if char_length(btrim(coalesce(e ->> 'name', ''))) not between 1 and 60 or pledged < 0 then
      raise exception 'invalid member' using errcode = '22023';
    end if;
    total := total + pledged;
  end loop;
  if coalesce(p_target, total) <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  perform set_config('luysmart.pool', 'on', true);
  insert into public.wallets_accounts (workspace_id, name, currency, balance, icon, visibility)
  values (p_workspace_id, left(btrim(p_title), 60), p_currency, 0, 'pool_' || lower(p_kind), 'SHARED')
  returning id into wallet_id;
  perform set_config('luysmart.pool', 'off', true);

  -- Charity: receipt photos are public by default (the point of the page); the keeper can still hide them.
  insert into public.pools (workspace_id, wallet_id, created_by, kind, title, split, target_budget, start_date, end_date, share_photos)
  values (p_workspace_id, wallet_id, uid, p_kind, left(btrim(p_title), 80), p_split, coalesce(p_target, total), p_start, p_end, p_kind = 'CHARITY')
  returning id into pool_id;

  for e in select * from jsonb_array_elements(p_members) loop
    i := i + 1;
    insert into public.pool_members (pool_id, name, pledged, sort)
    values (pool_id, left(btrim(e ->> 'name'), 60), coalesce((e ->> 'pledged')::numeric, 0), i)
    returning id into member_id;
    if p_record_paid and coalesce((e ->> 'pledged')::numeric, 0) > 0 then
      perform public.pool_record_contribution(pool_id, member_id, (e ->> 'pledged')::numeric, p_start);
    end if;
  end loop;
  return pool_id;
end;
$$;
revoke all on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean) from public, anon;
grant execute on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean) to authenticated;

create or replace function public.pool_snapshot(p_pool_id uuid, p_view text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.pools;
  w public.wallets_accounts;
  rate numeric;
  unit numeric;
  pooled numeric;
  spent numeric;
  remaining numeric;
  base numeric;
  pct numeric;
  gauge text;
  n integer;
  need numeric := null;
  per_member numeric := null;
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  keeper text;
  khqr text;
  members jsonb;
  expenses jsonb;
  top jsonb;
begin
  select * into p from public.pools where id = p_pool_id;
  if p.id is null then
    return null;
  end if;
  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
  unit := case when w.currency = 'KHR' then 1000 else 1 end;

  select coalesce(sum(amt) filter (where type = 'INCOME'), 0) + p.carried_in, coalesce(sum(amt) filter (where type = 'EXPENSE'), 0)
    into pooled, spent from public.pool_entries(p.id);
  remaining := pooled - spent;
  base := case when pooled > 0 then pooled else p.target_budget end;
  pct := case when base > 0 then round(remaining / base * 100, 1) else 0 end;
  gauge := case when remaining <= 0 or pct < 15 then 'low' when pct < 30 then 'caution' else 'safe' end;
  select greatest(count(*), 1) into n from public.pool_members where pool_id = p.id;

  if gauge <> 'safe' and p.status = 'active' then
    if p.start_date is not null and p.end_date is not null and today between p.start_date and p.end_date then
      -- Spending so far per day, for the days left, minus what is left.
      need := spent / (today - p.start_date + 1) * (p.end_date - today) - remaining;
    else
      -- Back up to the caution line (30 %).
      need := 0.30 * base - remaining;
    end if;
    if need > 0 then
      per_member := ceil(need / n / unit) * unit;
    end if;
  end if;

  select coalesce(nullif(btrim(pr.display_name), ''), '') , pr.khqr_payload into keeper, khqr
  from public.profiles pr where pr.id = p.created_by;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'pledged', m.pledged, 'paid', coalesce(paid.total, 0)) order by m.sort, m.created_at), '[]'::jsonb)
  into members
  from public.pool_members m
  left join lateral (
    select sum(public.amount_in_wallet_currency(t.amount, t.currency, coalesce(t.exchange_rate, rate), w.currency)) as total
    from public.pool_contributions pc join public.transactions t on t.id = pc.transaction_id
    where pc.member_id = m.id
  ) paid on true
  where m.pool_id = p.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'type', x.type, 'amt', x.amt, 'amount', x.amount, 'currency', x.currency,
           'note', x.note, 'category', x.category, 'preset_key', x.preset_key, 'date', x.tx_date,
           'receipt', case when p_view = 'app' or (p_view = 'public' and p.share_photos) then x.receipt end,
           -- A stable key for the public photo route (no transaction ids on the public page).
           'photo', case when x.receipt is not null and (p_view = 'app' or (p_view = 'public' and p.share_photos)) then left(md5(x.id::text), 16) end)
         order by x.tx_date desc, x.created_at desc), '[]'::jsonb)
  into expenses
  from (select * from public.pool_entries(p.id) e order by e.tx_date desc, e.created_at desc limit 300) x;

  select coalesce(jsonb_agg(jsonb_build_object('note', coalesce(x.note, x.category), 'amt', x.amt) order by x.amt desc), '[]'::jsonb)
  into top
  from (select * from public.pool_entries(p.id) e where e.type = 'EXPENSE' order by e.amt desc limit 3) x;

  return jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'title', p.title, 'split', p.split, 'currency', w.currency,
    'wallet_id', w.id, 'wallet_name', w.name, 'workspace_id', p.workspace_id,
    'target', p.target_budget, 'carried_in', p.carried_in, 'start_date', p.start_date, 'end_date', p.end_date,
    'status', p.status, 'settled_at', p.settled_at, 'settlement', p.settlement,
    'pooled', pooled, 'spent', spent, 'remaining', remaining, 'pct', pct, 'gauge', gauge,
    'member_count', n, 'topup_per_member', per_member,
    'keeper', keeper,
    -- Charity pools take donations at any time.
    'khqr', case when p_view = 'app' or p.kind = 'CHARITY' or gauge <> 'safe' or (p.settlement ->> 'mode') = 'COLLECT' then khqr end,
    'members', case when p_view <> 'public' or p.share_members then members else '[]'::jsonb end,
    'members_hidden', p_view = 'public' and not p.share_members,
    'entries', expenses,
    'top', top,
    'share_slug', case when p_view = 'app' then p.share_slug end,
    'share_photos', p.share_photos, 'share_members', p.share_members,
    'tg_linked', p.tg_chat_id is not null,
    'created_at', p.created_at
  );
end;
$$;
revoke all on function public.pool_snapshot(uuid, text) from public, anon, authenticated;

-- /spend gains an optional photo (the old 6-argument version is replaced; calls without it still work).
drop function if exists public.bot_pool_spend(text, bigint, bigint, numeric, text, text);
create or replace function public.bot_pool_spend(p_key text, p_group bigint, p_from bigint, p_amount numeric, p_currency text, p_note text, p_photo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  p public.pools;
  w public.wallets_accounts;
  rate numeric;
  category_id uuid;
  tx_id uuid;
begin
  perform public.require_bot(p_key);
  select * into p from public.pools where tg_chat_id = p_group and status = 'active';
  if p.id is null then
    return jsonb_build_object('status', 'no_pool');
  end if;
  uid := public.bot_user_of(p_from);
  if uid is null or uid is distinct from p.created_by then
    return jsonb_build_object('status', 'not_keeper');
  end if;
  perform public.bot_act_as(uid);
  if not public.can_write_workspace(p.workspace_id) then
    return jsonb_build_object('status', 'not_keeper');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1e12 or p_currency not in ('USD', 'KHR') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
  category_id := public.ensure_preset_category(p.workspace_id, 'pool_expense', 'EXPENSE', 'users', '#f59e0b', 'ចំណាយបេឡារួម');
  if p_photo is not null and p_photo !~ '^[A-Za-z0-9_-]{10,200}$' then
    p_photo := null;
  end if;
  -- A Telegram photo is kept as <keeper>/tg/<file id> (served through the app, never public by itself).
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, created_by, receipt_url)
  values (p.workspace_id, w.id, category_id, round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency::public.currency_code, 'EXPENSE',
          case when p_currency <> w.currency::text then rate end, left(nullif(btrim(coalesce(p_note, '')), ''), 500), uid,
          case when p_photo is not null then uid::text || '/tg/' || p_photo end)
  returning id into tx_id;
  return jsonb_build_object('status', 'ok', 'pool_id', p.id, 'transaction_id', tx_id);
end;
$$;
revoke all on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text) from public;
grant execute on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text) to anon, authenticated;

create or replace function public.bot_pool_pending(p_key text, p_pool_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  out jsonb := '[]'::jsonb;
  p public.pools;
  w public.wallets_accounts;
  rate numeric;
  items jsonb;
  newest timestamptz;
begin
  perform public.require_bot(p_key);
  for p in
    select * from public.pools x
    where (p_pool_id is null or x.id = p_pool_id)
      and ((x.tg_chat_id is not null and x.status = 'active') or not x.settlement_posted)
    order by x.created_at
    limit 50
  loop
    select * into w from public.wallets_accounts where id = p.wallet_id;
    select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'receipt', t.receipt_url is not null, 'type', t.type, 'amt', public.amount_in_wallet_currency(t.amount, t.currency, coalesce(t.exchange_rate, rate), w.currency),
                                                 'note', coalesce(t.note, c.name)) order by t.created_at), '[]'::jsonb),
           max(t.created_at)
      into items, newest
    from public.transactions t left join public.categories c on c.id = t.category_id
    where t.wallet_id = w.id and t.type in ('INCOME', 'EXPENSE') and t.created_at > p.posted_until and t.created_at >= p.created_at
      and t.created_at <= coalesce(p.settled_at, 'infinity'::timestamptz);
    continue when jsonb_array_length(items) = 0 and p.settlement_posted;
    out := out || jsonb_build_array(jsonb_build_object(
      'pool_id', p.id,
      'chat_id', coalesce(p.tg_chat_id, (p.settlement ->> 'group_chat')::bigint),
      'items', items, 'until', newest, 'low_alerted', p.low_alerted,
      'settle', not p.settlement_posted,
      'language', (select l.language from public.telegram_links l where l.user_id = p.created_by limit 1),
      'snapshot', public.pool_snapshot(p.id, 'group')
    ));
  end loop;
  return out;
end;
$$;
revoke all on function public.bot_pool_pending(text, uuid) from public;
grant execute on function public.bot_pool_pending(text, uuid) to anon, authenticated;

-- The bot remembers the card it posted for one expense.
create or replace function public.bot_pool_remember(p_key text, p_chat bigint, p_message_id bigint, p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.pool_tg_messages (chat_id, message_id, transaction_id)
  values (p_chat, p_message_id, p_transaction_id)
  on conflict (chat_id, message_id) do nothing;
  delete from public.pool_tg_messages where created_at < now() - interval '60 days';
end;
$$;
revoke all on function public.bot_pool_remember(text, bigint, bigint, uuid) from public;
grant execute on function public.bot_pool_remember(text, bigint, bigint, uuid) to anon, authenticated;

-- A photo sent (by the keeper) as a reply to an expense card: it becomes that entry's receipt.
create or replace function public.bot_pool_attach(p_key text, p_group bigint, p_from bigint, p_message_id bigint, p_photo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  tx_id uuid;
  p public.pools;
begin
  perform public.require_bot(p_key);
  select m.transaction_id into tx_id from public.pool_tg_messages m where m.chat_id = p_group and m.message_id = p_message_id;
  if tx_id is null then
    return jsonb_build_object('status', 'not_card');
  end if;
  select pl.* into p from public.pools pl join public.transactions t on t.wallet_id = pl.wallet_id
  where t.id = tx_id and pl.tg_chat_id = p_group order by pl.created_at desc limit 1;
  uid := public.bot_user_of(p_from);
  if p.id is null or uid is null or uid is distinct from p.created_by then
    return jsonb_build_object('status', 'not_keeper');
  end if;
  if p_photo !~ '^[A-Za-z0-9_-]{10,200}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform public.bot_act_as(uid);
  update public.transactions set receipt_url = uid::text || '/tg/' || p_photo where id = tx_id;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.bot_pool_attach(text, bigint, bigint, bigint, text) from public;
grant execute on function public.bot_pool_attach(text, bigint, bigint, bigint, text) to anon, authenticated;

-- The receipt of one entry on a public pool page (by its photo key), when photos are shared.
create or replace function public.pool_public_photo(p_slug text, p_photo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.receipt
  from public.pools p, lateral public.pool_entries(p.id) e
  where p_slug ~ '^[a-f0-9]{32}$' and p_photo ~ '^[a-f0-9]{16}$'
    and p.share_slug = p_slug and p.share_photos
    and e.receipt is not null and left(md5(e.id::text), 16) = p_photo
  limit 1;
$$;
revoke all on function public.pool_public_photo(text, text) from public;
grant execute on function public.pool_public_photo(text, text) to anon, authenticated;

select public.apply_security_gate();
