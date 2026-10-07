-- Shared pools, phase 1 (founder, 2026-10-07): family shares for Pchum Ben.
--
-- 1. pools.unit PERSON | FAMILY — members can be family shares ("គ្រួសារទី ១"…),
--    e.g. 10 families × $100 = $1,000. pools.template 'pchumben' adds the preset
--    categories ទាន/បច្ច័យ · សាំង/ធ្វើដំណើរ · ម្ហូបអាហារ/ជួបជុំ to the workspace.
-- 2. Payments in: a payment slip posted in the pool's group, or a KHQR payment
--    pushed by AUTOBOK with the pool's own key (lcp_…), waits in
--    pool_payments_pending with the unpaid shares; the treasurer (the keeper, or
--    a Telegram admin of the group) taps the share → recorded as that share's
--    contribution (the payer's name kept in the note). Once per bank ref / photo.
-- 3. pools.progress_msg: the live progress message in the group (edited in place).
-- 4. Spending from the group (the keeper: /spend, plain "ទិញផ្លែឈើ 40,000៛", or a
--    slip) can carry one of the template categories.

alter table public.pools
  add column if not exists unit text not null default 'PERSON',
  add column if not exists template text,
  add column if not exists progress_msg bigint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pools_unit_check') then
    alter table public.pools add constraint pools_unit_check check (unit in ('PERSON', 'FAMILY'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pools_template_check') then
    alter table public.pools add constraint pools_template_check check (template is null or template in ('pchumben'));
  end if;
end $$;

-- The Pchum Ben / family-gathering categories (created once per workspace).
create or replace function public.pool_template_categories(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_preset_category(p_workspace_id, 'pool_offering', 'EXPENSE', 'hand-heart', '#d97706', 'ទាន/បច្ច័យ');
  perform public.ensure_preset_category(p_workspace_id, 'pool_travel', 'EXPENSE', 'fuel', '#0ea5e9', 'សាំង/ធ្វើដំណើរ');
  perform public.ensure_preset_category(p_workspace_id, 'pool_food', 'EXPENSE', 'utensils', '#f97316', 'ម្ហូបអាហារ/ជួបជុំ');
end;
$$;
revoke all on function public.pool_template_categories(uuid) from public, anon, authenticated;

-- create_pool with the share unit and template (same rules as before).
drop function if exists public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean);
create or replace function public.create_pool(
  p_workspace_id uuid, p_kind text, p_title text, p_currency public.currency_code, p_split text,
  p_members jsonb, p_target numeric default null, p_start date default null, p_end date default null, p_record_paid boolean default false,
  p_unit text default 'PERSON', p_template text default null
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
  if coalesce(p_unit, 'PERSON') not in ('PERSON', 'FAMILY') or (p_template is not null and p_template not in ('pchumben')) then
    raise exception 'invalid option' using errcode = '22023';
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

  insert into public.pools (workspace_id, wallet_id, created_by, kind, title, split, target_budget, start_date, end_date, share_photos, unit, template)
  values (p_workspace_id, wallet_id, uid, p_kind, left(btrim(p_title), 80), p_split, coalesce(p_target, total), p_start, p_end, p_kind = 'CHARITY',
          coalesce(p_unit, 'PERSON'), p_template)
  returning id into pool_id;
  if p_template = 'pchumben' then
    perform public.pool_template_categories(p_workspace_id);
  end if;

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
revoke all on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean, text, text) from public, anon;
grant execute on function public.create_pool(uuid, text, text, public.currency_code, text, jsonb, numeric, date, date, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------- payments waiting for their share

create table if not exists public.pool_payments_pending (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid not null references public.pools (id) on delete cascade,
  amount      numeric not null check (amount > 0 and amount < 1e12),
  currency    text not null check (currency in ('USD', 'KHR')),
  payer       text,
  source      text not null check (source in ('slip', 'khqr')),
  ref         text not null,
  receipt     text,
  choices     jsonb not null default '[]'::jsonb,
  member_id   uuid references public.pool_members (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (pool_id, source, ref)
);
alter table public.pool_payments_pending enable row level security;
revoke all on public.pool_payments_pending from anon, authenticated;

-- What the treasurer is asked: the payment and the unpaid shares (in order), or why not.
create or replace function public.pool_payment_open(p_pool_id uuid, p_pay jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  pend public.pool_payments_pending;
  unpaid jsonb;
  ids jsonb;
  w public.wallets_accounts;
  rate numeric;
begin
  select * into p from public.pools where id = p_pool_id;
  if p.id is null or p.status <> 'active' then return jsonb_build_object('status', 'no_pool'); end if;
  if (p_pay ->> 'amount')::numeric is null or (p_pay ->> 'amount')::numeric <= 0 or p_pay ->> 'currency' not in ('USD', 'KHR')
     or nullif(p_pay ->> 'ref', '') is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
  -- Unpaid shares first (what they still owe), then the rest, by their order.
  with paid as (
    select m.id, m.name, m.pledged, m.sort,
           coalesce((select sum(public.amount_in_wallet_currency(t.amount, t.currency, coalesce(t.exchange_rate, rate), w.currency))
                     from public.pool_contributions pc join public.transactions t on t.id = pc.transaction_id where pc.member_id = m.id), 0) as paid
    from public.pool_members m where m.pool_id = p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'due', greatest(pledged - paid, 0)) order by sort), '[]'::jsonb),
         coalesce(jsonb_agg(id order by sort), '[]'::jsonb)
    into unpaid, ids
  from (select * from paid where pledged = 0 or paid < pledged order by sort limit 12) x;
  insert into public.pool_payments_pending (pool_id, amount, currency, payer, source, ref, receipt, choices)
  values (p.id, (p_pay ->> 'amount')::numeric, p_pay ->> 'currency', left(nullif(btrim(coalesce(p_pay ->> 'payer', '')), ''), 80), p_source,
          left(p_pay ->> 'ref', 120), case when p_pay ->> 'receipt' ~ '^[A-Za-z0-9_-]{10,200}$' then p_pay ->> 'receipt' end, ids)
  on conflict (pool_id, source, ref) do nothing
  returning * into pend;
  if pend.id is null then return jsonb_build_object('status', 'duplicate'); end if;
  return jsonb_build_object('status', 'ok', 'id', pend.id, 'pool_id', p.id, 'chat_id', p.tg_chat_id, 'title', p.title, 'unit', p.unit,
    'amount', pend.amount, 'currency', pend.currency, 'payer', pend.payer, 'unpaid', unpaid);
end;
$$;
revoke all on function public.pool_payment_open(uuid, jsonb, text) from public, anon, authenticated;

-- Bot: a payment slip read in the pool's group.
create or replace function public.bot_pool_payment_in(p_key text, p_group bigint, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  perform public.require_bot(p_key);
  select id into pid from public.pools where tg_chat_id = p_group and status = 'active';
  if pid is null then return jsonb_build_object('status', 'no_pool'); end if;
  return public.pool_payment_open(pid, p_pay, 'slip');
end;
$$;

-- Bot: the treasurer tapped a share. p_admin: the bot checked the tapper is a Telegram admin of the group.
create or replace function public.bot_pool_payment_assign(p_key text, p_group bigint, p_from bigint, p_admin boolean, p_pending uuid, p_choice int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pend public.pool_payments_pending;
  p public.pools;
  m public.pool_members;
  w public.wallets_accounts;
  rate numeric;
  amt numeric;
  category_id uuid;
  tx_id uuid;
begin
  perform public.require_bot(p_key);
  select * into pend from public.pool_payments_pending where id = p_pending for update;
  if pend.id is null then return jsonb_build_object('status', 'expired'); end if;
  select * into p from public.pools where id = pend.pool_id;
  if p.tg_chat_id is distinct from p_group then return jsonb_build_object('status', 'expired'); end if;
  if pend.resolved_at is not null then return jsonb_build_object('status', 'done'); end if;
  if p.status <> 'active' then return jsonb_build_object('status', 'closed'); end if;
  if not coalesce(p_admin, false) and public.bot_user_of(p_from) is distinct from p.created_by then
    return jsonb_build_object('status', 'not_keeper');
  end if;
  select * into m from public.pool_members where id = (pend.choices ->> p_choice)::uuid and pool_id = p.id;
  if m.id is null then return jsonb_build_object('status', 'invalid'); end if;

  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
  amt := round(public.amount_in_wallet_currency(pend.amount, pend.currency::public.currency_code, rate, w.currency), case when w.currency = 'KHR' then 0 else 2 end);
  perform public.bot_act_as(p.created_by);
  category_id := public.ensure_preset_category(p.workspace_id, 'pool_contribution', 'INCOME', 'hand-coins', '#10b981', 'វិភាគទានបេឡារួម');
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, created_by, receipt_url)
  values (p.workspace_id, w.id, category_id, amt, w.currency, 'INCOME',
          left(concat_ws(' · ', m.name, case when pend.payer is not null then '💵 ' || pend.payer end), 500), p.created_by,
          case when pend.receipt is not null then p.created_by::text || '/tg/' || pend.receipt end)
  returning id into tx_id;
  insert into public.pool_contributions (pool_id, member_id, transaction_id) values (p.id, m.id, tx_id);
  update public.pool_payments_pending set resolved_at = now(), member_id = m.id where id = pend.id;
  return jsonb_build_object('status', 'ok', 'pool_id', p.id, 'member', m.name, 'amount', amt, 'currency', w.currency, 'payer', pend.payer);
end;
$$;

-- Bot: is this Telegram user the pool's keeper (the treasurer)?
create or replace function public.bot_pool_is_keeper(p_key text, p_group bigint, p_from bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return exists (select 1 from public.pools p where p.tg_chat_id = p_group and p.status = 'active' and p.created_by = public.bot_user_of(p_from));
end;
$$;

-- Bot: remember / read the live progress message.
create or replace function public.bot_pool_progress_msg(p_key text, p_pool_id uuid, p_msg bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.pools set progress_msg = p_msg where id = p_pool_id;
end;
$$;

-- Spending from the group, with a template category (pool_offering / pool_travel / pool_food) when known.
drop function if exists public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text);
create or replace function public.bot_pool_spend(p_key text, p_group bigint, p_from bigint, p_amount numeric, p_currency text, p_note text,
                                                 p_photo text default null, p_preset text default null)
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
  if p_preset in ('pool_offering', 'pool_travel', 'pool_food') then
    perform public.pool_template_categories(p.workspace_id);
    select id into category_id from public.categories where workspace_id = p.workspace_id and preset_key = p_preset and type = 'EXPENSE' limit 1;
  end if;
  category_id := coalesce(category_id, public.ensure_preset_category(p.workspace_id, 'pool_expense', 'EXPENSE', 'users', '#f59e0b', 'ចំណាយបេឡារួម'));
  if p_photo is not null and p_photo !~ '^[A-Za-z0-9_-]{10,200}$' then
    p_photo := null;
  end if;
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, created_by, receipt_url)
  values (p.workspace_id, w.id, category_id, round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency::public.currency_code, 'EXPENSE',
          case when p_currency <> w.currency::text then rate end, left(nullif(btrim(coalesce(p_note, '')), ''), 500), uid,
          case when p_photo is not null then uid::text || '/tg/' || p_photo end)
  returning id into tx_id;
  return jsonb_build_object('status', 'ok', 'pool_id', p.id, 'transaction_id', tx_id);
end;
$$;

-- ---------------------------------------------------------------- AUTOBOK → a pool (its own key, lcp_…)

create table if not exists public.pool_khqr_keys (
  pool_id      uuid primary key references public.pools (id) on delete cascade,
  key_hash     text not null unique,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.pool_khqr_keys enable row level security;
revoke all on public.pool_khqr_keys from anon, authenticated;

-- App (the keeper): a new key for the pool — shown once; any previous key stops working.
create or replace function public.pool_khqr_key_create(p_pool_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.pools;
  k text;
begin
  select * into p from public.pools where id = p_pool_id;
  if p.id is null or uid is distinct from p.created_by or not public.access_ok() then raise exception 'not allowed' using errcode = '42501'; end if;
  k := 'lcp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.pool_khqr_keys (pool_id, key_hash, created_by) values (p.id, encode(sha256(convert_to(k, 'UTF8')), 'hex'), uid)
  on conflict (pool_id) do update set key_hash = excluded.key_hash, created_by = excluded.created_by, created_at = now(), last_used_at = null;
  return k;
end;
$$;
revoke all on function public.pool_khqr_key_create(uuid) from public, anon;
grant execute on function public.pool_khqr_key_create(uuid) to authenticated;

-- Server (the /api/khqr/ingest route): a payment pushed with a pool key.
create or replace function public.bot_pool_khqr_ingest(p_key text, p_key_hash text, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.pool_khqr_keys;
begin
  perform public.require_bot(p_key);
  select * into k from public.pool_khqr_keys where key_hash = lower(coalesce(p_key_hash, ''));
  if k.pool_id is null
     or not exists (select 1 from public.pools where id = k.pool_id and created_by = k.created_by)
     or exists (select 1 from public.account_controls c where c.user_id = k.created_by and c.suspended_at is not null) then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  update public.pool_khqr_keys set last_used_at = now() where pool_id = k.pool_id;
  return public.pool_payment_open(k.pool_id, p_pay, 'khqr');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_pool_payment_in(text, bigint, jsonb)',
    'public.bot_pool_payment_assign(text, bigint, bigint, boolean, uuid, int)',
    'public.bot_pool_progress_msg(text, uuid, bigint)',
    'public.bot_pool_is_keeper(text, bigint, bigint)',
    'public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text, text)',
    'public.bot_pool_khqr_ingest(text, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- The snapshot also carries the share unit and template.
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
    'unit', p.unit,
    'template', p.template,
    'progress_msg', case when p_view = 'group' then p.progress_msg end,
    'created_at', p.created_at
  );
end;
$$;

select public.apply_security_gate();
