-- Shared pools (បេឡារួម): money collected for one event, held by a keeper.
--   Kinds: FESTIVAL (Pchum Ben, Khmer New Year, Kathen, merit-making),
--   FAMILY (reunions, anniversaries, housewarming), TRIP, GENERAL.
--   * Each pool has its own wallet. Contributions are income entries,
--     each linked to a member; spending is ordinary expense entries in that
--     wallet (from the app, the private bot chat, or /spend in the linked group).
--   * Members put in equal or custom amounts (pledged vs paid).
--   * Gauge: remaining / pooled → safe > 30 %, caution 15–30 %, low < 15 %
--     (with a suggested top-up per member).
--   * Close: REFUND the surplus (in proportion to what each paid), ROLLOVER
--     into a new pool on the same wallet, or COLLECT a deficit (keeper's KHQR).
--   * Sharing: an optional read-only link (/p/<slug>, random, revocable; receipt
--     photos and the member list each opt-in), and an optional Telegram group
--     linked by the keeper with a one-time code. In that group, /pool shows the
--     pool, /spend lets the keeper log, and every new entry is posted there.
--     Only this pool's wallet is ever shown, never anything else of the keeper's.
--   * FREE: one active pool per keeper; PRO / ULTRA: unlimited.

create table if not exists public.pools (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  wallet_id        uuid not null references public.wallets_accounts (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  kind             text not null default 'GENERAL' check (kind in ('FESTIVAL', 'FAMILY', 'TRIP', 'GENERAL')),
  title            text not null check (char_length(btrim(title)) between 1 and 80),
  split            text not null default 'EQUAL' check (split in ('EQUAL', 'CUSTOM')),
  target_budget    numeric(15, 2) not null check (target_budget > 0 and target_budget < 1e12),
  carried_in       numeric(15, 2) not null default 0,
  start_date       date,
  end_date         date check (end_date is null or start_date is null or end_date >= start_date),
  status           text not null default 'active' check (status in ('active', 'settled')),
  settled_at       timestamptz,
  settlement       jsonb,
  share_slug       text unique check (share_slug is null or share_slug ~ '^[a-f0-9]{32}$'),
  share_photos     boolean not null default false,
  share_members    boolean not null default true,
  tg_chat_id       bigint unique,
  tg_link_code     text,
  tg_link_expires  timestamptz,
  posted_until     timestamptz not null default now(),
  low_alerted      boolean not null default false,
  settlement_posted boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index if not exists pools_one_active_per_wallet on public.pools (wallet_id) where status = 'active';
create index if not exists pools_workspace_idx on public.pools (workspace_id, created_at desc);

create table if not exists public.pool_members (
  id         uuid primary key default gen_random_uuid(),
  pool_id    uuid not null references public.pools (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  pledged    numeric(15, 2) not null default 0 check (pledged >= 0 and pledged < 1e12),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pool_members_pool_idx on public.pool_members (pool_id, sort);

create table if not exists public.pool_contributions (
  id             uuid primary key default gen_random_uuid(),
  pool_id        uuid not null references public.pools (id) on delete cascade,
  member_id      uuid not null references public.pool_members (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index if not exists pool_contributions_pool_idx on public.pool_contributions (pool_id);

alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.pool_contributions enable row level security;

drop policy if exists pools_select on public.pools;
create policy pools_select on public.pools for select to authenticated using (public.is_workspace_member(workspace_id));
-- Plain settings may be edited directly; money, status and sharing go through the functions below.
drop policy if exists pools_update on public.pools;
create policy pools_update on public.pools for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
revoke insert, update, delete on public.pools from anon, authenticated;
grant select on public.pools to authenticated;
grant update (title, kind, target_budget, start_date, end_date) on public.pools to authenticated;

drop policy if exists pool_members_select on public.pool_members;
create policy pool_members_select on public.pool_members for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists pool_members_write on public.pool_members;
create policy pool_members_write on public.pool_members for all to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.status = 'active' and public.can_write_workspace(p.workspace_id)))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.status = 'active' and public.can_write_workspace(p.workspace_id)));
grant select, insert, update, delete on public.pool_members to authenticated;

drop policy if exists pool_contributions_select on public.pool_contributions;
create policy pool_contributions_select on public.pool_contributions for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and public.is_workspace_member(p.workspace_id)));
revoke insert, update, delete on public.pool_contributions from anon, authenticated;
grant select on public.pool_contributions to authenticated;

-- A pool's wallet isn't one of the keeper's own: it doesn't use a FREE wallet slot.
do $$
declare
  def text := pg_get_functiondef('public.guard_wallet_limit()'::regprocedure);
begin
  if position('luysmart.pool' in def) = 0 then
    def := replace(def, $r$or coalesce(current_setting('luysmart.import', true), '') = 'on' then$r$,
      $r$or coalesce(current_setting('luysmart.import', true), '') = 'on' or coalesce(current_setting('luysmart.pool', true), '') = 'on' then$r$);
    def := replace(def, $r$and not w.is_starter and w.id <> new.id;$r$,
      $r$and not w.is_starter and w.id <> new.id and not exists (select 1 from public.pools p where p.wallet_id = w.id);$r$);
    if position('luysmart.pool' in def) = 0 or position('public.pools p where p.wallet_id = w.id' in def) = 0 then
      raise exception 'guard_wallet_limit: patch points not found';
    end if;
    execute def;
  end if;
end $$;

-- The pool's entries: income and expenses in its wallet from its start until it closed,
-- with the amount in the wallet's currency (amt).
create or replace function public.pool_entries(p_pool_id uuid)
returns table (id uuid, type text, amt numeric, amount numeric, currency text, note text, category text, preset_key text,
               tx_date timestamptz, receipt text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.type::text,
         public.amount_in_wallet_currency(t.amount, t.currency, coalesce(t.exchange_rate, coalesce(ws.khr_per_usd, 4000)), w.currency),
         t.amount, t.currency::text, t.note, c.name, c.preset_key, t.transaction_date, t.receipt_url, t.created_at
  from public.pools p
  join public.wallets_accounts w on w.id = p.wallet_id
  join public.workspaces ws on ws.id = p.workspace_id
  join public.transactions t on t.wallet_id = w.id
  left join public.categories c on c.id = t.category_id
  where p.id = p_pool_id and t.type in ('INCOME', 'EXPENSE')
    -- A rolled-over pool starts after the old one closed (same wallet): strictly later.
    and (t.created_at > p.created_at or (p.carried_in = 0 and t.created_at = p.created_at))
    and t.created_at <= coalesce(p.settled_at, 'infinity'::timestamptz);
$$;
revoke all on function public.pool_entries(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The picture of a pool. p_view: 'app' (everything), 'group' (no photo paths),
-- 'public' (photos / members only when shared). No access check: callers do it.
-- ---------------------------------------------------------------------------
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
           'receipt', case when p_view = 'app' or (p_view = 'public' and p.share_photos) then x.receipt end)
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
    'khqr', case when p_view = 'app' or gauge <> 'safe' or (p.settlement ->> 'mode') = 'COLLECT' then khqr end,
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

-- App: one pool (members of its workspace).
create or replace function public.pool_view(p_pool_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.pools where id = p_pool_id;
  if ws is null or not public.is_workspace_member(ws) then
    return null;
  end if;
  return public.pool_snapshot(p_pool_id, 'app');
end;
$$;
revoke all on function public.pool_view(uuid) from public, anon;
grant execute on function public.pool_view(uuid) to authenticated;

-- Public link /p/<slug>: anyone with the link, no account.
create or replace function public.pool_public(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if p_slug !~ '^[a-f0-9]{32}$' then
    return null;
  end if;
  select id into pid from public.pools where share_slug = p_slug;
  if pid is null then
    return null;
  end if;
  -- No internal ids on the public page.
  return (select s - 'id' - 'wallet_id' - 'workspace_id'
            || jsonb_build_object('members', coalesce((select jsonb_agg(m - 'id') from jsonb_array_elements(s -> 'members') m), '[]'::jsonb),
                                  'entries', coalesce((select jsonb_agg(e - 'id') from jsonb_array_elements(s -> 'entries') e), '[]'::jsonb))
          from public.pool_snapshot(pid, 'public') s);
end;
$$;
revoke all on function public.pool_public(text) from public;
grant execute on function public.pool_public(text) to anon, authenticated;

-- Receipt photos of a shared pool (photos switched on) may be shown on its public page.
create or replace function public.pool_shared_receipt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.transactions t join public.pools p on p.wallet_id = t.wallet_id
    where t.receipt_url = p_name and p.share_slug is not null and p.share_photos
      and t.created_at >= p.created_at and t.created_at <= coalesce(p.settled_at, 'infinity'::timestamptz)
  );
$$;
grant execute on function public.pool_shared_receipt(text) to anon, authenticated;
drop policy if exists receipts_select_pool_share on storage.objects;
create policy receipts_select_pool_share on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'receipts' and public.pool_shared_receipt(name));

-- ---------------------------------------------------------------------------
-- Keeper actions
-- ---------------------------------------------------------------------------
create or replace function public.pool_record_contribution(p_pool_id uuid, p_member_id uuid, p_amount numeric, p_date date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  w public.wallets_accounts;
  m public.pool_members;
  category_id uuid;
  tx_id uuid;
begin
  select * into p from public.pools where id = p_pool_id for update;
  if p.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.status <> 'active' then
    raise exception 'pool is closed' using errcode = '22023';
  end if;
  select * into m from public.pool_members where id = p_member_id and pool_id = p.id;
  if m.id is null or p_amount is null or p_amount <= 0 or p_amount >= 1e12 then
    raise exception 'invalid contribution' using errcode = '22023';
  end if;
  select * into w from public.wallets_accounts where id = p.wallet_id;
  category_id := public.ensure_preset_category(p.workspace_id, 'pool_contribution', 'INCOME', 'hand-coins', '#10b981', 'វិភាគទានបេឡារួម');
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, transaction_date, note, created_by)
  values (p.workspace_id, w.id, category_id, round(p_amount, case when w.currency = 'KHR' then 0 else 2 end), w.currency, 'INCOME',
          coalesce(p_date::timestamp at time zone 'Asia/Phnom_Penh' + interval '12 hours', now()), left(m.name, 500), (select auth.uid()))
  returning id into tx_id;
  insert into public.pool_contributions (pool_id, member_id, transaction_id) values (p.id, m.id, tx_id);
end;
$$;
revoke all on function public.pool_record_contribution(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.pool_record_contribution(uuid, uuid, numeric, date) to authenticated;

-- New pool with its wallet and members ([{"name": "…", "pledged": 50}]);
-- p_record_paid also records every pledge as already contributed.
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

  insert into public.pools (workspace_id, wallet_id, created_by, kind, title, split, target_budget, start_date, end_date)
  values (p_workspace_id, wallet_id, uid, p_kind, left(btrim(p_title), 80), p_split, coalesce(p_target, total), p_start, p_end)
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

-- Share link on / off (a new link each time it is switched on), photos and members opt-in.
create or replace function public.pool_set_sharing(p_pool_id uuid, p_on boolean, p_photos boolean, p_members boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  slug text;
begin
  select * into p from public.pools where id = p_pool_id for update;
  if p.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  slug := case when not p_on then null when p.share_slug is not null then p.share_slug else replace(gen_random_uuid()::text, '-', '') end;
  update public.pools set share_slug = slug, share_photos = coalesce(p_photos, share_photos), share_members = coalesce(p_members, share_members)
  where id = p.id;
  return slug;
end;
$$;
revoke all on function public.pool_set_sharing(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.pool_set_sharing(uuid, boolean, boolean, boolean) to authenticated;

-- A one-time code (30 minutes) the keeper sends in the Telegram group: /pool link CODE.
create or replace function public.pool_telegram_code(p_pool_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  select * into p from public.pools where id = p_pool_id for update;
  if p.id is null or p.created_by is distinct from (select auth.uid()) or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.pools set tg_link_code = code, tg_link_expires = now() + interval '30 minutes' where id = p.id;
  return code;
end;
$$;
revoke all on function public.pool_telegram_code(uuid) from public, anon;
grant execute on function public.pool_telegram_code(uuid) to authenticated;

create or replace function public.pool_telegram_unlink(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pools set tg_chat_id = null, tg_link_code = null
  where id = p_pool_id and public.can_write_workspace(workspace_id);
end;
$$;
revoke all on function public.pool_telegram_unlink(uuid) from public, anon;
grant execute on function public.pool_telegram_unlink(uuid) to authenticated;

-- Close the pool. REFUND: the surplus back in proportion to what each paid
-- (equally when nothing was recorded); COLLECT: the deficit shared the same
-- way, paid to the keeper's KHQR; ROLLOVER: the remaining money starts a new
-- pool on the same wallet (same members, nothing pledged yet).
create or replace function public.pool_settle(p_pool_id uuid, p_mode text, p_next_title text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  snap jsonb;
  remaining numeric;
  paid_total numeric;
  n integer;
  scale integer;
  shares jsonb;
  next_id uuid;
  m record;
  result jsonb;
begin
  select * into p from public.pools where id = p_pool_id for update;
  if p.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.status <> 'active' then
    raise exception 'pool is closed' using errcode = '22023';
  end if;
  if p_mode not in ('REFUND', 'COLLECT', 'ROLLOVER') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  snap := public.pool_snapshot(p.id, 'app');
  remaining := (snap ->> 'remaining')::numeric;
  scale := case when snap ->> 'currency' = 'KHR' then 0 else 2 end;
  -- Money left: refund or roll over; money short: collect.
  if (p_mode in ('REFUND', 'ROLLOVER') and remaining < 0) or (p_mode = 'COLLECT' and remaining >= 0) or (p_mode = 'ROLLOVER' and remaining = 0) then
    raise exception 'mode does not fit the balance' using errcode = '22023';
  end if;
  select coalesce(sum((x ->> 'paid')::numeric), 0), greatest(count(*), 1) into paid_total, n from jsonb_array_elements(snap -> 'members') x;
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', x ->> 'name',
           'amount', round(abs(remaining) * case when paid_total > 0 then (x ->> 'paid')::numeric / paid_total else 1.0 / n end, scale))), '[]'::jsonb)
  into shares
  from jsonb_array_elements(snap -> 'members') x;

  update public.pools set status = 'settled', settled_at = now(), settlement_posted = (tg_chat_id is null)
  where id = p.id;

  if p_mode = 'ROLLOVER' then
    insert into public.pools (workspace_id, wallet_id, created_by, kind, title, split, target_budget, carried_in, share_photos, share_members)
    values (p.workspace_id, p.wallet_id, p.created_by, p.kind, left(btrim(coalesce(nullif(p_next_title, ''), p.title)), 80), p.split,
            remaining, remaining, p.share_photos, p.share_members)
    returning id into next_id;
    for m in select * from public.pool_members where pool_id = p.id order by sort, created_at loop
      insert into public.pool_members (pool_id, name, pledged, sort) values (next_id, m.name, 0, m.sort);
    end loop;
    -- The group follows the money.
    if p.tg_chat_id is not null then
      update public.pools set tg_chat_id = null where id = p.id;
      update public.pools set tg_chat_id = p.tg_chat_id where id = next_id;
      update public.pools set settlement_posted = false where id = p.id;
    end if;
  end if;

  result := jsonb_build_object('mode', p_mode, 'remaining', remaining, 'shares', case when p_mode = 'ROLLOVER' then '[]'::jsonb else shares end,
                               'next_pool_id', next_id, 'group_chat', p.tg_chat_id);
  update public.pools set settlement = result where id = p.id;
  return result;
end;
$$;
revoke all on function public.pool_settle(uuid, text, text) from public, anon;
grant execute on function public.pool_settle(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Telegram (the official bot; groups only, linked by the keeper)
-- ---------------------------------------------------------------------------
-- The linked LuyChlat account of a Telegram user (their private chat id is their user id).
create or replace function public.bot_user_of(p_from bigint)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.telegram_links where chat_id = p_from;
$$;
revoke all on function public.bot_user_of(bigint) from public, anon, authenticated;

create or replace function public.bot_pool_link(p_key text, p_group bigint, p_from bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  p public.pools;
begin
  perform public.require_bot(p_key);
  uid := public.bot_user_of(p_from);
  if uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into p from public.pools
  where tg_link_code = upper(btrim(p_code)) and tg_link_expires > now() and status = 'active' and created_by = uid
  for update;
  if p.id is null then
    return jsonb_build_object('status', 'bad_code');
  end if;
  update public.pools set tg_chat_id = null where tg_chat_id = p_group and id <> p.id;
  update public.pools set tg_chat_id = p_group, tg_link_code = null, posted_until = now() where id = p.id;
  return jsonb_build_object('status', 'ok', 'title', p.title);
end;
$$;
revoke all on function public.bot_pool_link(text, bigint, bigint, text) from public;
grant execute on function public.bot_pool_link(text, bigint, bigint, text) to anon, authenticated;

-- /pool in a linked group (or the last pool it had): its picture, plus the keeper's chat language.
create or replace function public.bot_pool_group(p_key text, p_group bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
begin
  perform public.require_bot(p_key);
  select * into p from public.pools where tg_chat_id = p_group;
  if p.id is null then
    return null;
  end if;
  return public.pool_snapshot(p.id, 'group')
    || jsonb_build_object('language', (select l.language from public.telegram_links l where l.user_id = p.created_by limit 1));
end;
$$;
revoke all on function public.bot_pool_group(text, bigint) from public;
grant execute on function public.bot_pool_group(text, bigint) to anon, authenticated;

-- /spend in a linked group: the keeper only.
create or replace function public.bot_pool_spend(p_key text, p_group bigint, p_from bigint, p_amount numeric, p_currency text, p_note text)
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
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, created_by)
  values (p.workspace_id, w.id, category_id, round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency::public.currency_code, 'EXPENSE',
          case when p_currency <> w.currency::text then rate end, left(nullif(btrim(coalesce(p_note, '')), ''), 500), uid);
  return jsonb_build_object('status', 'ok', 'pool_id', p.id);
end;
$$;
revoke all on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text) from public;
grant execute on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text) to anon, authenticated;

-- What the linked groups haven't seen yet: new entries and closings.
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
    select coalesce(jsonb_agg(jsonb_build_object('type', t.type, 'amt', public.amount_in_wallet_currency(t.amount, t.currency, coalesce(t.exchange_rate, rate), w.currency),
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

create or replace function public.bot_pool_posted(p_key text, p_pool_id uuid, p_until timestamptz, p_low boolean, p_settled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.pools
  set posted_until = greatest(posted_until, coalesce(p_until, posted_until)),
      low_alerted = coalesce(p_low, low_alerted),
      settlement_posted = settlement_posted or coalesce(p_settled, false)
  where id = p_pool_id;
end;
$$;
revoke all on function public.bot_pool_posted(text, uuid, timestamptz, boolean, boolean) from public;
grant execute on function public.bot_pool_posted(text, uuid, timestamptz, boolean, boolean) to anon, authenticated;

select public.apply_security_gate();
