-- A bank wallet's account number (លេខគណនី), kept apart from its name
-- (shown masked, e.g. 386***6262). Bank alerts forwarded to the bot match a
-- wallet by the account's last digits in its name OR at the end of this number.

alter table public.wallets_accounts add column if not exists account_no text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_account_no_check') then
    alter table public.wallets_accounts add constraint wallets_account_no_check
      check (account_no is null or account_no ~ '^[0-9][0-9 -]{2,29}$');
  end if;
end $$;

grant update (account_no) on public.wallets_accounts to authenticated;

-- bot_bank_alert: "the wallet whose name carries ••6222" now also means "whose account number ends in 6222".
do $$
declare
  def text;
  old_match text := 'x.name ~ (''(^|\D)'' || suffix || ''(\D|$)'')';
  new_match text := '(x.name ~ (''(^|\D)'' || suffix || ''(\D|$)'') or regexp_replace(coalesce(x.account_no, ''''), ''\D'', '''', ''g'') like (''%'' || suffix))';
begin
  def := pg_get_functiondef('public.bot_bank_alert(text, bigint, jsonb)'::regprocedure);
  if position('account_no' in def) = 0 then
    if position(old_match in def) = 0 then
      raise exception 'bot_bank_alert: wallet match not found';
    end if;
    execute replace(def, old_match, new_match);
  end if;
end $$;
