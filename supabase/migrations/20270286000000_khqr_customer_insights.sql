-- «អតិថិជនទៀងទាត់» — KHQR regular-customer insights (founder, 4/11/2026 — ROADMAP Phase 3, src/lib/customer-insights.ts):
-- from the payer names the banks print on each KHQR payment (khqr_payments.payer), over the last p_days days:
--   regulars  the payers who came back most (2+ payments), with their total and last visit
--   missing   regulars (3+ payments) not seen for longer than usual (twice their average gap, at least 14 days)
--   hours     the sales per hour of the day, Cambodian time
-- Only a customer's payment counts — INCOME in the Sales category, never an own-account transfer or a repayment — the
-- same guard as the SoundBox. The OWNER of a BUSINESS workspace only (strict workspace isolation; never a member, never
-- a Personal or Family book, never the bot). Read-only, additive.
create or replace function public.khqr_customer_insights(p_workspace_id uuid, p_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 7), 365);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 7), 365));
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.role = 'OWNER' and w.type = 'BUSINESS'
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  with sales as (
    select btrim(k.payer) as payer, t.amount, t.currency, t.transaction_date as paid_at
    from public.khqr_payments k
    join public.transactions t on t.id = k.transaction_id
    join public.categories c on c.id = t.category_id
    where k.workspace_id = p_workspace_id
      and t.workspace_id = p_workspace_id
      and t.type = 'INCOME' and t.debt_id is null and c.preset_key = 'sales'
      and t.transaction_date >= v_since
      and nullif(btrim(coalesce(k.payer, '')), '') is not null
  ),
  people as (
    select payer,
      count(*) as visits,
      coalesce(sum(amount) filter (where currency = 'KHR'), 0) as khr,
      coalesce(sum(amount) filter (where currency = 'USD'), 0) as usd,
      min(paid_at) as first_at,
      max(paid_at) as last_at
    from sales
    group by payer
  )
  select jsonb_build_object(
    'days', v_days,
    'sales', (select count(*) from sales),
    'payers', (select count(*) from people),
    'regulars', coalesce((
      select jsonb_agg(r order by r.visits desc, r.last_at desc)
      from (
        select payer, visits, khr, usd, last_at
        from people where visits >= 2
        order by visits desc, last_at desc
        limit 10
      ) r), '[]'::jsonb),
    'missing', coalesce((
      select jsonb_agg(m order by m.visits desc)
      from (
        select payer, visits, last_at,
          floor(extract(epoch from (now() - last_at)) / 86400)::int as days_since
        from people
        where visits >= 3
          and now() - last_at > greatest(interval '14 days', 2 * (last_at - first_at) / (visits - 1))
        order by visits desc
        limit 5
      ) m), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'sales', h.n) order by h.hour)
      from (
        select extract(hour from paid_at at time zone 'Asia/Phnom_Penh')::int as hour, count(*) as n
        from sales group by 1
      ) h), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.khqr_customer_insights(uuid, int) from public, anon;
grant execute on function public.khqr_customer_insights(uuid, int) to authenticated;
