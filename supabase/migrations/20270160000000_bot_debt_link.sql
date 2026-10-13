-- Receipts and «clc paid» meet the loans (founder, 13/10/2026):
--   bot_debt_link_payment  a slip just saved whose payee is a loan the person owes (e.g. CAMBODIAN LABOR
--                          CARE PLC → the CLC loan) becomes that loan's repayment on one tap: categorised
--                          «សងបំណុល», linked to the debt, the debt's balance (and its LOAN bill) updated —
--                          the same records record_debt_repayment makes. Only in the debt's own currency
--                          (a repayment equals its transaction), never above what is left.
--   bot_debt_installment   the loan's monthly installment, for «clc paid» typed without an amount.

create or replace function public.bot_debt_link_payment(p_key text, p_chat_id bigint, p_tx_id uuid, p_debt_prefix text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  link record;
  t public.transactions;
  d public.debts;
  n integer;
  cat uuid;
begin
  perform public.require_bot(p_key);
  if p_debt_prefix !~ '^[0-9a-f-]{8,36}$' then return jsonb_build_object('status', 'gone'); end if;
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select * into t from public.transactions
  where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '7 days';
  if t.id is null then return jsonb_build_object('status', 'gone'); end if;
  if t.debt_id is not null then return jsonb_build_object('status', 'already'); end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  select count(*) into n from public.debts
  where workspace_id = t.workspace_id and type = 'PAYABLE' and status <> 'SETTLED' and id::text like p_debt_prefix || '%';
  if n <> 1 then return jsonb_build_object('status', 'gone'); end if;
  select * into d from public.debts
  where workspace_id = t.workspace_id and type = 'PAYABLE' and status <> 'SETTLED' and id::text like p_debt_prefix || '%'
  for update;
  if d.currency <> t.currency then return jsonb_build_object('status', 'currency', 'party', d.party_name); end if;
  if t.amount > d.total_amount - d.paid_amount then return jsonb_build_object('status', 'too_much', 'party', d.party_name); end if;

  cat := public.ensure_preset_category(d.workspace_id, 'debt_repayment', 'EXPENSE', 'hand-coins', '#64748b', 'សងបំណុល');
  update public.transactions set category_id = cat, debt_id = d.id where id = t.id;
  insert into public.debt_repayments (debt_id, wallet_id, amount_paid, payment_date, note, transaction_id)
  values (d.id, t.wallet_id, t.amount, t.transaction_date, left(coalesce(t.note, d.party_name), 300), t.id);
  select * into d from public.debts where id = d.id;
  return jsonb_build_object('status', 'ok', 'party', d.party_name, 'remaining', d.total_amount - d.paid_amount, 'currency', d.currency);
end;
$$;

create or replace function public.bot_debt_installment(p_key text, p_chat_id bigint, p_debt_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  link record;
  d public.debts;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then return null; end if;
  perform public.bot_act_as(link.uid);
  select * into d from public.debts where id = p_debt_id and type = 'PAYABLE' and status <> 'SETTLED';
  if d.id is null or not public.can_write_workspace(d.workspace_id) then return null; end if;
  return jsonb_build_object(
    'installment', d.schedule_payment,
    'bill_amount', (select b.amount from public.recurring_bills b where b.debt_id = d.id and b.is_active and b.currency = d.currency order by b.created_at limit 1),
    'remaining', d.total_amount - d.paid_amount,
    'currency', d.currency
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_debt_link_payment(text, bigint, uuid, text)',
    'public.bot_debt_installment(text, bigint, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
