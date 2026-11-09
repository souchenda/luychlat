-- Money in and out from the bank apps' notifications on the person's own Android phone (founder, 9/11/2026 — «no AUTOBOK,
-- no Telegram group: just the phone»). The app (1.15+, android/…/BankNoticeListener.java) queues a bank app's notice on
-- the phone; the signed-in page parses it (lib/bot/bank-alert.ts — the same reader as a notice forwarded to the bot) and
-- calls app_bank_alert. Saved at once with an Undo, like the bot's bank alerts (the approved exception).
--
-- Never guessed (guardrail 1, «ask, never guess»): the wallet is the ONE open ordinary wallet the person may write whose
-- account number — or name — ends in the notice's last digits; none or more than one → nothing is booked and the page says
-- so. Never twice: the same notice (its fingerprint, shared with the bot's alerts) or the same money already in that
-- wallet within 15 minutes (a KHQR sale AUTOBOK recorded, an entry the person typed) is skipped.
--
-- p_alert: {"amount", "currency", "direction": "IN"|"OUT", "suffix": "6222", "party", "ref", "kind",
--           "fingerprint": "<sha256 of the notice>", "posted_at": "2026-11-09T10:15:00+07:00"}

create or replace function public.app_bank_alert(p_alert jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  amount numeric := (p_alert ->> 'amount')::numeric;
  cur text := p_alert ->> 'currency';
  dir text := p_alert ->> 'direction';
  suffix text := p_alert ->> 'suffix';
  fp text := p_alert ->> 'fingerprint';
  posted timestamptz;
  hits uuid[];
  w public.wallets_accounts;
  ws public.workspaces;
  existing uuid;
  category_id uuid;
  tx_id uuid;
  note text;
  tx_type public.transaction_type;
begin
  if uid is null then
    return jsonb_build_object('status', 'signed_out');
  end if;
  if amount is null or amount <= 0 or amount >= 1e12 or cur not in ('USD', 'KHR') or dir not in ('IN', 'OUT')
     or coalesce(suffix, '') !~ '^\d{3,4}$' or coalesce(fp, '') !~ '^[a-f0-9]{16,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select transaction_id into existing from public.bank_alerts where user_id = uid and fingerprint = fp;
  if found then
    return jsonb_build_object('status', 'duplicate', 'transaction_id', existing);
  end if;

  -- The person's own open ordinary wallets (never a savings goal) whose account number or name ends in the digits.
  select array_agg(x.id order by x.created_at) into hits
  from public.wallets_accounts x
  where x.archived_at is null and x.goal_target is null
    and (x.visibility <> 'PERSONAL' or x.owner_id = uid)
    and public.can_write_workspace(x.workspace_id)
    and (right(regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g'), length(suffix)) = suffix
         or x.name ~ ('(^|\D)' || suffix || '(\D|$)'));
  if coalesce(cardinality(hits), 0) = 0 then
    return jsonb_build_object('status', 'no_wallet', 'suffix', suffix);
  end if;
  if cardinality(hits) > 1 then
    -- Two wallets end in the same digits (USD and KHR accounts never do — their numbers differ): the currency decides,
    -- else the person picks; never a guess.
    select array_agg(x.id) into hits from public.wallets_accounts x where x.id = any(hits) and x.currency::text = cur;
    if coalesce(cardinality(hits), 0) <> 1 then
      return jsonb_build_object('status', 'ambiguous', 'suffix', suffix);
    end if;
  end if;
  select * into w from public.wallets_accounts where id = hits[1];
  select * into ws from public.workspaces where id = w.workspace_id;

  begin
    posted := (p_alert ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;
  tx_type := case when dir = 'IN' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end;

  -- The same money already in this wallet (AUTOBOK's KHQR record, the bot, the person's own entry): not twice.
  select t.id into existing from public.transactions t
  where t.wallet_id = w.id and t.type = tx_type and t.currency::text = cur and t.amount = round(amount, case when cur = 'KHR' then 0 else 2 end)
    and t.transaction_date between posted - interval '15 minutes' and posted + interval '15 minutes'
  limit 1;
  if found then
    -- Remembered as seen, linked to nothing: an Undo here must never delete the other record.
    insert into public.bank_alerts (user_id, fingerprint, transaction_id) values (uid, fp, null) on conflict do nothing;
    return jsonb_build_object('status', 'duplicate', 'transaction_id', existing);
  end if;

  category_id := (
    select c.id from public.categories c
    where c.workspace_id = ws.id and c.type = case when dir = 'IN' then 'INCOME'::public.category_type else 'EXPENSE'::public.category_type end
      and c.preset_key = case when dir = 'OUT' then 'other_expense' when ws.type = 'BUSINESS' then 'sales' else 'other_income' end
    limit 1);
  note := left(concat_ws(' · ',
            case when p_alert ->> 'kind' = 'KHQR' then 'KHQR' end,
            nullif(btrim(coalesce(p_alert ->> 'party', '')), ''),
            case when nullif(p_alert ->> 'ref', '') is not null then 'Ref ' || (p_alert ->> 'ref') end), 500);

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
  values (ws.id, w.id, category_id, round(amount, case when cur = 'KHR' then 0 else 2 end), cur::public.currency_code, tx_type,
          case when cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end, nullif(note, ''), posted, uid)
  returning id into tx_id;
  insert into public.bank_alerts (user_id, fingerprint, transaction_id) values (uid, fp, tx_id);

  return jsonb_build_object('status', 'ok', 'transaction_id', tx_id, 'wallet', w.name, 'workspace', ws.name,
                            'type', tx_type, 'amount', amount, 'currency', cur);
end;
$$;
revoke all on function public.app_bank_alert(jsonb) from public, anon;
grant execute on function public.app_bank_alert(jsonb) to authenticated;

-- Undo under a notice the app recorded: only an entry made from a bank notice, by this person.
create or replace function public.app_bank_undo(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not exists (
    select 1 from public.bank_alerts a join public.transactions t on t.id = a.transaction_id
    where a.user_id = uid and a.transaction_id = p_transaction_id and t.created_by = uid and public.can_write_workspace(t.workspace_id)
  ) then
    return jsonb_build_object('status', 'gone');
  end if;
  delete from public.bank_alerts where user_id = uid and transaction_id = p_transaction_id;
  delete from public.transactions where id = p_transaction_id;
  return jsonb_build_object('status', 'undone');
end;
$$;
revoke all on function public.app_bank_undo(uuid) from public, anon;
grant execute on function public.app_bank_undo(uuid) to authenticated;
