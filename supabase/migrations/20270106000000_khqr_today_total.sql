-- KHQR group confirmation with the day's running total (LuyChlat as the only responder):
--   ✅ +1,275,000៛ បានកត់ត្រា (ABA DL KHR)
--   📊 ថ្ងៃនេះ៖ 2,994,000៛ • 2 ប្រតិបត្តិការ
-- Server (bot key): for a recorded KHQR sale, today's sales (Cambodia date) in the same wallet.
create or replace function public.bot_khqr_today(p_key text, p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.transactions;
  day date := (now() at time zone 'Asia/Phnom_Penh')::date;
begin
  perform public.require_bot(p_key);
  select * into t from public.transactions where id = p_transaction_id;
  if t.id is null then return null; end if;
  return (
    select jsonb_build_object('total', coalesce(sum(x.amount), 0), 'count', count(*), 'currency', t.currency,
                              'wallet', (select w.name from public.wallets_accounts w where w.id = t.wallet_id))
    from public.khqr_payments k
    join public.transactions x on x.id = k.transaction_id
    where k.workspace_id = t.workspace_id and x.wallet_id = t.wallet_id and x.type = 'INCOME' and x.currency = t.currency
      and (x.transaction_date at time zone 'Asia/Phnom_Penh')::date = day);
end;
$$;
revoke all on function public.bot_khqr_today(text, uuid) from public;
grant execute on function public.bot_khqr_today(text, uuid) to anon, authenticated;

select public.apply_security_gate();
