-- A shared pool's spending slip posted twice was spent twice (09/10: $17.88 to SOPHEAP KHEANG,
-- the same photo at 09:19 and 09:20). The spend now refuses a slip it has already paid out —
-- by the slip's own Trx ID, by Telegram's unique photo ID, or by the same uploaded file — and
-- answers "duplicate" with the pool's balance, so the group is told instead.
-- (The parameters grew, so the old signature is dropped first: no ambiguous overload.)

drop function if exists public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text, text);

create or replace function public.bot_pool_spend(p_key text, p_group bigint, p_from bigint, p_amount numeric, p_currency text, p_note text,
                                                 p_photo text default null, p_preset text default null,
                                                 p_ref text default null, p_unique text default null)
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
  v_ref text := nullif(upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_unique text := nullif(regexp_replace(coalesce(p_unique, ''), '[^A-Za-z0-9_-]', '', 'g'), '');
  dup public.transactions;
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
  if char_length(v_ref) < 6 then v_ref := null; end if;
  -- The same slip twice is never spent twice: its Trx ID, the same photo (Telegram's unique ID),
  -- or the very same uploaded file already paid out of this pool.
  select t.* into dup from public.transactions t
  where t.wallet_id = w.id and t.type = 'EXPENSE'
    and ((v_ref is not null and t.bank_ref = 'ref:' || v_ref)
      or (v_unique is not null and t.bank_ref = 'tg:' || v_unique)
      or (p_photo is not null and t.receipt_url = uid::text || '/tg/' || p_photo))
  limit 1;
  if dup.id is not null then
    return jsonb_build_object('status', 'duplicate', 'pool_id', p.id, 'transaction_id', dup.id, 'amount', dup.amount, 'currency', dup.currency,
      'note', dup.note, 'balance', w.balance, 'balance_currency', w.currency);
  end if;
  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, created_by, receipt_url, bank_ref)
  values (p.workspace_id, w.id, category_id, round(p_amount, case when p_currency = 'KHR' then 0 else 2 end), p_currency::public.currency_code, 'EXPENSE',
          case when p_currency <> w.currency::text then rate end, left(nullif(btrim(coalesce(p_note, '')), ''), 500), uid,
          case when p_photo is not null then uid::text || '/tg/' || p_photo end,
          coalesce('ref:' || v_ref, 'tg:' || v_unique))
  returning id into tx_id;
  return jsonb_build_object('status', 'ok', 'pool_id', p.id, 'transaction_id', tx_id);
end;
$$;
revoke all on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text, text, text, text) from public;
grant execute on function public.bot_pool_spend(text, bigint, bigint, numeric, text, text, text, text, text, text) to anon, authenticated;

-- The kept $17.88 (09:19) is already protected: its stored photo matches a re-post of that slip.

select public.apply_security_gate();
