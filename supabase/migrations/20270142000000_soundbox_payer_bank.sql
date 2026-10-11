-- SoundBox: the customer's bank / channel as the bank prints it ("ABA Bank", "ABA PAY"), for the
-- payment flash. The 3-argument emit stays for a deploy in progress; the 4-argument one adds the bank.
alter table public.soundbox_events add column if not exists payer_bank text check (payer_bank is null or char_length(payer_bank) <= 60);

create or replace function public.bot_soundbox_emit(p_key text, p_transaction_id uuid, p_payer text, p_payer_bank text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  perform public.require_bot(p_key);
  select tx.id, tx.workspace_id, tx.amount, tx.currency, tx.transaction_date, w.name as wallet
  into t
  from public.transactions tx
  join public.wallets_accounts w on w.id = tx.wallet_id
  join public.categories c on c.id = tx.category_id
  where tx.id = p_transaction_id
    and tx.type = 'INCOME' and tx.bank_ref is not null and tx.debt_id is null
    and c.preset_key = 'sales';
  if t.id is null then
    return jsonb_build_object('status', 'skipped');
  end if;
  insert into public.soundbox_events (workspace_id, transaction_id, amount, currency, account_name, payer, payer_bank, transaction_time)
  values (t.workspace_id, t.id, t.amount, t.currency, t.wallet, nullif(left(btrim(coalesce(p_payer, '')), 80), ''),
          nullif(left(btrim(coalesce(p_payer_bank, '')), 60), ''), t.transaction_date)
  on conflict (transaction_id) do nothing;
  delete from public.soundbox_events where created_at < now() - interval '3 days';
  return jsonb_build_object('status', 'ok', 'workspace_id', t.workspace_id);
end;
$$;
revoke all on function public.bot_soundbox_emit(text, uuid, text, text) from public;
grant execute on function public.bot_soundbox_emit(text, uuid, text, text) to anon, authenticated;
