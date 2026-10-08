-- Shared pools: the treasurer sets the KHQR the members pay into — one per pool —
-- instead of an AUTOBOK key. Kept as the KHQR's text (decoded on the device from
-- the uploaded image, or the treasurer's profile KHQR), so the pool page, the
-- public link and the Telegram group all redraw the same scannable code.
-- A family pool shows it on the public link while it is open.

alter table public.pools add column if not exists khqr_payload text
  check (khqr_payload is null or (khqr_payload ~ '^000201' and char_length(khqr_payload) between 20 and 512));

-- App: set (or clear) the pool's KHQR — the keeper or the workspace's writers.
create or replace function public.pool_set_khqr(p_pool_id uuid, p_payload text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
begin
  select * into p from public.pools where id = p_pool_id;
  if p.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.pools set khqr_payload = nullif(btrim(p_payload), '') where id = p.id;
end;
$$;
revoke all on function public.pool_set_khqr(uuid, text) from public, anon;
grant execute on function public.pool_set_khqr(uuid, text) to authenticated;

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
  -- The pool's own KHQR (set by the treasurer) before the keeper's profile one.
  khqr := coalesce(p.khqr_payload, khqr);

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
    'khqr', case when p_view = 'app' or p.kind = 'CHARITY' or p.khqr_payload is not null or (p.unit = 'FAMILY' and p.status = 'active')
                   or gauge <> 'safe' or (p.settlement ->> 'mode') = 'COLLECT' then khqr end,
    'khqr_own', p.khqr_payload is not null,
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
