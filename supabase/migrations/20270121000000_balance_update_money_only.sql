-- A statement save failed with "insufficient_balance" (08/10, 36 new lines + 2 matched): matching
-- a line marks the existing entry reconciled — an UPDATE — and every UPDATE took the entry's
-- effect off the balances and put it back, re-running the transfer's "insufficient balance"
-- check. With the statement's new expenses already taking the wallet below zero, marking a
-- matched transfer reconciled was refused. The same blocked editing a note or a tag on any
-- transfer out of a wallet that is currently negative.
--
-- An update that changes no money field (wallets, amounts, currency, type, rate) does not touch
-- balances at all, so it can't be refused. A new transfer, or a changed one, is checked as before.

create or replace function public.on_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.wallet_id, new.to_wallet_id, new.amount, new.to_amount, new.currency, new.type, new.exchange_rate)
         is not distinct from (old.wallet_id, old.to_wallet_id, old.amount, old.to_amount, old.currency, old.type, old.exchange_rate) then
    return null; -- reconciled, a note, a tag…: the balances are the same
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.adjust_wallet_balances(old, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.adjust_wallet_balances(new, 1);
  end if;
  return null;
end;
$$;
