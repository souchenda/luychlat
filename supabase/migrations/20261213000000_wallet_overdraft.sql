-- Overdraft (OD) / working-capital credit line on a bank wallet, like ACLEDA /
-- ABA business accounts: the wallet's balance stays the ledger balance (own
-- cash; negative while the OD is drawn), od_limit is the facility, and the
-- app shows available = balance + od_limit. Net worth keeps using the balance
-- only (an unused credit line is not money you own).
--
-- Transfers out of a wallet may now go down to minus its OD limit (cards keep
-- their credit limit; other wallets still stop at zero). Expenses never had a check.

alter table public.wallets_accounts add column if not exists od_limit numeric(18, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_od_limit_check') then
    alter table public.wallets_accounts add constraint wallets_od_limit_check
      check (od_limit is null or (od_limit > 0 and od_limit < 1e12 and kind = 'STANDARD' and goal_target is null));
  end if;
end $$;

grant update (od_limit) on public.wallets_accounts to authenticated;

do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.adjust_wallet_balances(public.transactions, integer)'::regprocedure);
  if position('od_limit' in def) = 0 then
    def := replace(
      def,
      'balance < case when kind = ''CREDIT_CARD'' then -credit_limit else 0 end',
      'balance < case when kind = ''CREDIT_CARD'' then -credit_limit else -coalesce(od_limit, 0) end'
    );
    if position('od_limit' in def) = 0 then
      raise exception 'adjust_wallet_balances: balance check not found';
    end if;
    execute def;
  end if;
end $$;
