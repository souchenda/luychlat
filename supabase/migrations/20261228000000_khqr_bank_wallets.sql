-- KHQR payments went to the wrong bank's wallet: a wallet was the bank's only when
-- its NAME said so, so ABA payments for "DL KHR" / "DL USD" (bank picked: ABA)
-- landed in the ACLEDA wallets. The bank picked for the wallet (its icon) now counts.
-- Also: the linked groups' titles, so a payment is announced only in its bank's group.

create or replace function public.khqr_record(p_ws uuid, p_uid uuid, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
  w public.wallets_accounts;
  v_bank text := upper(btrim(coalesce(p_pay ->> 'bank', '')));
  amount numeric;
  v_cur text := upper(btrim(coalesce(p_pay ->> 'currency', '')));
  v_ref text := lower(btrim(coalesce(p_pay ->> 'ref', '')));
  payer text := left(nullif(btrim(coalesce(p_pay ->> 'payer', '')), ''), 80);
  posted timestamptz;
  category_id uuid;
  tx_id uuid;
  bank_re text;
begin
  if not public.biz_group_allowed(p_uid) then
    return jsonb_build_object('status', 'plan_required');
  end if;
  begin
    amount := (p_pay ->> 'amount')::numeric;
  exception when others then
    amount := null;
  end;
  if v_bank not in ('ACLEDA', 'ABA') or amount is null or amount <= 0 or amount >= 1e12 or v_cur not in ('USD', 'KHR') or v_ref !~ '^[a-z0-9]{4,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into ws from public.workspaces where id = p_ws;
  if ws.id is null or ws.type <> 'BUSINESS' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform public.bot_act_as(p_uid);
  if not public.can_write_workspace(ws.id) then
    return jsonb_build_object('status', 'not_writable');
  end if;

  -- Already recorded (a retry, the same payment twice, or the group listener got it first).
  if exists (select 1 from public.khqr_payments k where k.workspace_id = ws.id and k.bank = v_bank and k.ref = v_ref) then
    return jsonb_build_object('status', 'duplicate', 'workspace', ws.name,
      'transaction_id', (select k.transaction_id from public.khqr_payments k where k.workspace_id = ws.id and k.bank = v_bank and k.ref = v_ref));
  end if;

  -- The bank's wallet in this currency, else any wallet of that bank, else one in the currency, else the first.
  -- A wallet is the bank's by the bank picked for it (icon 'aba' / 'acleda') or by its name ("DL KHR" at ABA is ABA's).
  bank_re := case when v_bank = 'ACLEDA' then '(acleda|អេស៊ីលីដា)' else '(^|[^a-z])aba([^a-z]|$)' end;
  select x.* into w from public.wallets_accounts x
  where x.workspace_id = ws.id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
  order by ((lower(coalesce(x.icon, '')) = lower(v_bank) or lower(x.name) ~ bank_re) and x.currency::text = v_cur) desc,
           (lower(coalesce(x.icon, '')) = lower(v_bank) or lower(x.name) ~ bank_re) desc,
           (x.currency::text = v_cur) desc, x.created_at
  limit 1;
  if w.id is null then
    return jsonb_build_object('status', 'no_wallet', 'workspace', ws.name);
  end if;

  category_id := coalesce(
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'sales' limit 1),
    (select c.id from public.categories c where c.workspace_id = ws.id and c.type = 'INCOME' and c.preset_key = 'other_income' limit 1));
  begin
    posted := (p_pay ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by, bank_ref)
  values (ws.id, w.id, category_id, round(amount, case when v_cur = 'KHR' then 0 else 2 end), v_cur::public.currency_code, 'INCOME',
          case when v_cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end,
          left('KHQR ពី ' || coalesce(payer, '—') || ' (Ref: ' || v_ref || ')', 500), posted, p_uid, left(v_ref, 64))
  returning id into tx_id;
  insert into public.khqr_payments (workspace_id, bank, ref, transaction_id) values (ws.id, v_bank, v_ref, tx_id)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok', 'transaction_id', tx_id, 'workspace', ws.name, 'wallet', w.name,
    'amount', round(amount, case when v_cur = 'KHR' then 0 else 2 end), 'currency', v_cur, 'bank', v_bank,
    'posted_at', posted);
end;
$$;
revoke all on function public.khqr_record(uuid, uuid, jsonb) from public, anon, authenticated;

drop function if exists public.bot_biz_groups_of(text, uuid);
-- Server: the Telegram groups linked to a workspace, with their titles (the route posts only in the payment's bank's group).
create function public.bot_biz_groups_of(p_key text, p_workspace_id uuid)
returns table (chat_id bigint, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query select g.chat_id, g.title from public.biz_groups g where g.workspace_id = p_workspace_id;
end;
$$;
revoke all on function public.bot_biz_groups_of(text, uuid) from public;
grant execute on function public.bot_biz_groups_of(text, uuid) to anon, authenticated;

select public.apply_security_gate();
