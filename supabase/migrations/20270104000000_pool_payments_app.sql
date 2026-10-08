-- Shared pools in the app: the bank payments waiting for "whose share is it?"
-- (a slip posted in the pool's Telegram group, or a KHQR payment AUTOBOK pushed
-- with the pool key) can be assigned on the pool page too, with one tap — the
-- same result as the treasurer's tap in the group (bot_pool_payment_assign).

-- App: the pool's unassigned payments (keeper / workspace writers only).
create or replace function public.pool_pending_payments(p_pool_id uuid)
returns jsonb
language plpgsql
stable
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
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'amount', x.amount, 'currency', x.currency, 'payer', x.payer,
                                        'source', x.source, 'created_at', x.created_at) order by x.created_at)
    from public.pool_payments_pending x
    where x.pool_id = p.id and x.resolved_at is null), '[]'::jsonb);
end;
$$;

-- App: assign one waiting payment to a share — the INCOME entry in the pool's wallet
-- (converted to its currency), the contribution, and the payment marked done.
create or replace function public.pool_payment_assign(p_pending uuid, p_member_id uuid)
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
  select * into pend from public.pool_payments_pending where id = p_pending for update;
  if pend.id is null then return jsonb_build_object('status', 'expired'); end if;
  select * into p from public.pools where id = pend.pool_id;
  if not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if pend.resolved_at is not null then return jsonb_build_object('status', 'done'); end if;
  if p.status <> 'active' then return jsonb_build_object('status', 'closed'); end if;
  select * into m from public.pool_members where id = p_member_id and pool_id = p.id;
  if m.id is null then return jsonb_build_object('status', 'invalid'); end if;

  select * into w from public.wallets_accounts where id = p.wallet_id;
  select coalesce(khr_per_usd, 4000) into rate from public.workspaces where id = p.workspace_id;
  amt := round(public.amount_in_wallet_currency(pend.amount, pend.currency::public.currency_code, rate, w.currency), case when w.currency = 'KHR' then 0 else 2 end);
  category_id := public.ensure_preset_category(p.workspace_id, 'pool_contribution', 'INCOME', 'hand-coins', '#10b981', 'វិភាគទានបេឡារួម');
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, created_by, receipt_url)
  values (p.workspace_id, w.id, category_id, amt, w.currency, 'INCOME',
          left(concat_ws(' · ', m.name, case when pend.payer is not null then '💵 ' || pend.payer end), 500), p.created_by,
          case when pend.receipt is not null then p.created_by::text || '/tg/' || pend.receipt end)
  returning id into tx_id;
  insert into public.pool_contributions (pool_id, member_id, transaction_id) values (p.id, m.id, tx_id);
  update public.pool_payments_pending set resolved_at = now(), member_id = m.id where id = pend.id;
  return jsonb_build_object('status', 'ok', 'member', m.name, 'amount', amt, 'currency', w.currency);
end;
$$;

revoke all on function public.pool_pending_payments(uuid) from public, anon;
grant execute on function public.pool_pending_payments(uuid) to authenticated;
revoke all on function public.pool_payment_assign(uuid, uuid) from public, anon;
grant execute on function public.pool_payment_assign(uuid, uuid) to authenticated;

select public.apply_security_gate();
