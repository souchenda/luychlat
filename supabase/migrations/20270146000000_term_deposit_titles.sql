-- Fixed deposits: the /bills reminder is titled «Chip Mong Bank — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ២១ តុលា ២០២៦)»
-- (p_dep.bill_title), and the bank is the one on the screen, named as the app's wallet providers name
-- it (src/lib/bot/term-deposit.ts) — the founder's deposit is Chip Mong Bank, not ACLEDA.
create or replace function public.bot_term_deposit(p_key text, p_chat_id bigint, p_dep jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  d jsonb := p_dep;
  existing uuid;
  wallet uuid;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  if not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  perform public.bot_act_as(link.uid);
  if not public.can_write_workspace(link.ws) then raise exception 'not_writable' using errcode = '42501'; end if;

  select id into existing from public.wallets_accounts
  where workspace_id = link.ws and archived_at is null and name = left(d->>'wallet_name', 60);
  if existing is not null then
    return jsonb_build_object('status', 'duplicate', 'wallet_id', existing, 'workspace', (select name from public.workspaces where id = link.ws));
  end if;

  -- An existing deposit arrives with its principal (as an import does); goal wallets otherwise start empty.
  perform set_config('luysmart.import', 'on', true);
  insert into public.wallets_accounts (workspace_id, name, currency, balance, icon, goal_target, goal_date, owner_id)
  values (link.ws, left(d->>'wallet_name', 60), (d->>'currency')::public.currency_code, (d->>'principal')::numeric,
    nullif(d->>'icon', ''), nullif(d->>'maturity_amount', '')::numeric, (d->>'maturity_date')::date, link.uid)
  returning id into wallet;
  perform set_config('luysmart.import', 'off', true);

  -- No paying wallet: a deposit's reminder is never «paid» from anything.
  insert into public.recurring_bills (workspace_id, title, kind, amount, currency, frequency, due_date, remind_days)
  values (link.ws, left(coalesce(nullif(d->>'bill_title', ''), d->>'wallet_name'), 80), 'DEPOSIT', coalesce(nullif(d->>'maturity_amount', '')::numeric, (d->>'principal')::numeric),
    (d->>'currency')::public.currency_code, 'YEARLY', (d->>'maturity_date')::date, '{7,3,1}');

  return jsonb_build_object('status', 'ok', 'wallet_id', wallet, 'workspace', (select name from public.workspaces where id = link.ws));
end;
$$;
revoke all on function public.bot_term_deposit(text, bigint, jsonb) from public;
grant execute on function public.bot_term_deposit(text, bigint, jsonb) to anon, authenticated;
