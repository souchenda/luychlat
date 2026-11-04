-- «Recorded twice?» (founder, 4/11/2026): an expense just saved that looks like one already in the book — the person is
-- asked, never a silent delete. The same payment twice means:
--   the same workspace, an expense of the same currency and the same amount, neither a debt repayment,
--   the other saved within the last 24 hours, the two payment times no more than 3 hours apart, and
--   one from a bank slip (bank_ref) and the other typed / spoken — the usual «voice note, then the slip» — or
--   both typed with the same note within 5 minutes (a double send).
-- Two different bank references are two real payments: never a duplicate. Read-only checks; one delete, by the person.

create or replace function public.tx_duplicate_core(p_tx_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('status', 'dup', 'id', o.id, 'note', o.note, 'amount', o.amount, 'currency', o.currency, 'at', o.transaction_date)
    from public.transactions t
    join public.transactions o
      on o.workspace_id = t.workspace_id and o.id <> t.id and o.type = 'EXPENSE' and o.currency = t.currency and o.amount = t.amount
     and o.debt_id is null and o.created_at > now() - interval '24 hours'
     and abs(extract(epoch from (o.transaction_date - t.transaction_date))) <= 3 * 3600
     and (
       (o.bank_ref is null) <> (t.bank_ref is null)
       or (o.bank_ref is null and t.bank_ref is null and lower(btrim(coalesce(o.note, ''))) = lower(btrim(coalesce(t.note, '')))
           and abs(extract(epoch from (o.created_at - t.created_at))) <= 300)
     )
    where t.id = p_tx_id and t.type = 'EXPENSE' and t.debt_id is null
    order by abs(extract(epoch from (o.transaction_date - t.transaction_date)))
    limit 1
  ), jsonb_build_object('status', 'none'));
$$;
revoke all on function public.tx_duplicate_core(uuid) from public, anon, authenticated;

-- The app: the signed-in member of the entry's workspace.
create or replace function public.possible_duplicate(p_tx_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.transactions where id = p_tx_id;
  if ws is null or not public.is_workspace_member(ws) then
    return jsonb_build_object('status', 'none');
  end if;
  return public.tx_duplicate_core(p_tx_id);
end;
$$;
revoke all on function public.possible_duplicate(uuid) from public, anon;
grant execute on function public.possible_duplicate(uuid) to authenticated;

-- The bot: the chat's linked person, a member of the entry's workspace.
create or replace function public.bot_duplicate_of(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  ws uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  select workspace_id into ws from public.transactions where id = p_tx_id;
  if link.uid is null or ws is null
     or not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = link.uid) then
    return jsonb_build_object('status', 'none');
  end if;
  return public.tx_duplicate_core(p_tx_id);
end;
$$;

-- [🗑 លុបមួយនេះ] under the question: the person's own expense of the last day, never a repayment, in a workspace the chat
-- may write to.
create or replace function public.bot_dup_delete(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select * into t from public.transactions
  where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and debt_id is null and created_at > now() - interval '24 hours';
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  delete from public.transactions where id = t.id;
  return jsonb_build_object('ok', true, 'amount', t.amount, 'currency', t.currency);
end;
$$;

revoke all on function public.bot_duplicate_of(text, bigint, uuid) from public;
revoke all on function public.bot_dup_delete(text, bigint, uuid) from public;
grant execute on function public.bot_duplicate_of(text, bigint, uuid) to anon, authenticated;
grant execute on function public.bot_dup_delete(text, bigint, uuid) to anon, authenticated;

select public.apply_security_gate();
