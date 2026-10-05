-- 1. Move a wallet to another of your workspaces (e.g. Personal → "DL MEAT SUPPLY").
--    Its entries, statement imports and balance go with it. Categories are
--    matched in the new workspace (same preset, or same name and type) or
--    copied. Transfers with wallets that stay behind become a plain expense
--    on one side and income on the other (both balances unchanged). Debt
--    entries can't move (the debt stays): the move is refused. Pool wallets
--    stay with their pool.
--    The (wallet, workspace) and (category, workspace) foreign keys become
--    DEFERRABLE (still checked immediately by default) so everything changes
--    in one transaction and is verified at commit.
-- 2. Bank alerts forwarded to the bot (ACLEDA, KHQR): saved at once into the
--    wallet whose name has the account's last digits, with Undo; the same
--    alert twice is skipped; the balance only with the AI-numbers opt-in.

alter table public.transactions alter constraint transactions_wallet_id_workspace_id_fkey deferrable initially immediate;
alter table public.transactions alter constraint transactions_to_wallet_id_workspace_id_fkey deferrable initially immediate;
alter table public.transactions alter constraint transactions_category_id_workspace_id_fkey deferrable initially immediate;
alter table public.statement_imports alter constraint statement_imports_wallet_id_workspace_id_fkey deferrable initially immediate;
alter table public.statement_lines alter constraint statement_lines_wallet_id_workspace_id_fkey deferrable initially immediate;
alter table public.tontines alter constraint tontines_wallet_id_workspace_id_fkey deferrable initially immediate;

-- The same category in another workspace: by preset, else by name and type, else a copy.
create or replace function public.category_in_workspace(p_category_id uuid, p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.categories;
  found uuid;
begin
  select * into c from public.categories where id = p_category_id;
  if c.id is null then
    return null;
  end if;
  if c.workspace_id = p_workspace_id then
    return c.id;
  end if;
  select id into found from public.categories
  where workspace_id = p_workspace_id and type = c.type
    and ((c.preset_key is not null and preset_key = c.preset_key) or (c.preset_key is null and preset_key is null and lower(btrim(name)) = lower(btrim(c.name))))
  order by created_at limit 1;
  if found is null then
    insert into public.categories (workspace_id, name, type, icon, color, preset_key)
    values (p_workspace_id, c.name, c.type, c.icon, c.color, c.preset_key)
    returning id into found;
  end if;
  return found;
end;
$$;
revoke all on function public.category_in_workspace(uuid, uuid) from public, anon, authenticated;

create or replace function public.move_wallet(p_wallet_id uuid, p_target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  w public.wallets_accounts;
  src uuid;
  src_name text;
  target public.workspaces;
  t public.transactions;
  other public.wallets_accounts;
  in_cat_src uuid;
  out_cat_src uuid;
  in_cat_dst uuid;
  out_cat_dst uuid;
  converted integer := 0;
  moved integer := 0;
begin
  select * into w from public.wallets_accounts where id = p_wallet_id for update;
  if w.id is null or uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  src := w.workspace_id;
  select * into target from public.workspaces where id = p_target_workspace_id;
  if target.id is null or not public.can_write_workspace(src) or not public.can_write_workspace(target.id) or target.archived_at is not null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if src = target.id then
    return jsonb_build_object('moved', 0, 'converted', 0);
  end if;
  if w.visibility = 'PERSONAL' and w.owner_id is distinct from uid then
    raise exception 'personal_wallet: only its owner can move it' using errcode = '42501';
  end if;
  if exists (select 1 from public.pools where wallet_id = w.id) then
    raise exception 'move_blocked:pool' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.transactions where (wallet_id = w.id or to_wallet_id = w.id) and debt_id is not null)
     or exists (select 1 from public.debt_repayments where wallet_id = w.id)
     or exists (select 1 from public.debt_tranches where wallet_id = w.id) then
    raise exception 'move_blocked:debt' using errcode = 'P0001';
  end if;
  select name into src_name from public.workspaces where id = src;

  -- Guards for other members' personal wallets were checked above, once, for the whole move.
  perform set_config('luysmart.system', 'on', true);
  set constraints public.transactions_wallet_id_workspace_id_fkey, public.transactions_to_wallet_id_workspace_id_fkey,
    public.transactions_category_id_workspace_id_fkey, public.statement_imports_wallet_id_workspace_id_fkey,
    public.statement_lines_wallet_id_workspace_id_fkey, public.tontines_wallet_id_workspace_id_fkey deferred;

  update public.wallets_accounts set workspace_id = target.id where id = w.id;

  -- Transfers with wallets that stay: one plain entry on each side, same date and amounts.
  for t in
    select * from public.transactions
    where type = 'TRANSFER' and workspace_id = src and (wallet_id = w.id) <> (to_wallet_id = w.id)
    order by transaction_date
  loop
    if in_cat_src is null then
      in_cat_src := public.ensure_preset_category(src, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
      out_cat_src := public.ensure_preset_category(src, 'workspace_transfer_out', 'EXPENSE', 'arrow-left-right', '#64748b', 'ផ្ទេរទៅកន្លែងធ្វើការផ្សេង');
      in_cat_dst := public.ensure_preset_category(target.id, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
      out_cat_dst := public.ensure_preset_category(target.id, 'workspace_transfer_out', 'EXPENSE', 'arrow-left-right', '#64748b', 'ផ្ទេរទៅកន្លែងធ្វើការផ្សេង');
    end if;
    select * into other from public.wallets_accounts where id = case when t.wallet_id = w.id then t.to_wallet_id else t.wallet_id end;
    delete from public.transactions where id = t.id;
    if t.wallet_id = w.id then
      -- Money left the moved wallet for one that stays.
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by)
      values (target.id, w.id, out_cat_dst, t.amount, t.currency, 'EXPENSE', left(coalesce(t.note || ' · ', '') || '→ ' || other.name, 500), t.transaction_date, t.created_by);
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by)
      values (src, other.id, in_cat_src, coalesce(t.to_amount, t.amount), other.currency, 'INCOME', left(coalesce(t.note || ' · ', '') || '← ' || w.name, 500), t.transaction_date, t.created_by);
    else
      -- Money came into the moved wallet from one that stays.
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by)
      values (src, other.id, out_cat_src, t.amount, t.currency, 'EXPENSE', left(coalesce(t.note || ' · ', '') || '→ ' || w.name, 500), t.transaction_date, t.created_by);
      insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by)
      values (target.id, w.id, in_cat_dst, coalesce(t.to_amount, t.amount), w.currency, 'INCOME', left(coalesce(t.note || ' · ', '') || '← ' || other.name, 500), t.transaction_date, t.created_by);
    end if;
    converted := converted + 1;
  end loop;

  -- Everything else on the wallet moves, with its category matched in the new workspace.
  update public.transactions x
  set workspace_id = target.id,
      category_id = case when x.category_id is null then null else public.category_in_workspace(x.category_id, target.id) end
  where x.wallet_id = w.id and x.workspace_id = src;
  get diagnostics moved = row_count;

  update public.statement_imports set workspace_id = target.id where wallet_id = w.id;
  update public.statement_lines set workspace_id = target.id where wallet_id = w.id;
  -- Things in the old workspace that pointed at the wallet let go of it.
  update public.tontines set wallet_id = null where wallet_id = w.id;
  update public.recurring_bills set wallet_id = null where wallet_id = w.id and workspace_id <> target.id;
  update public.invoices set target_wallet_id = null where target_wallet_id = w.id and workspace_id <> target.id;

  perform set_config('luysmart.system', 'off', true);
  return jsonb_build_object('moved', moved, 'converted', converted, 'from', src_name, 'to', target.name);
end;
$$;
revoke all on function public.move_wallet(uuid, uuid) from public, anon;
grant execute on function public.move_wallet(uuid, uuid) to authenticated;


-- LuyChlat AI's month totals leave the new transfer categories out too (not income or spending).
do $$
declare
  def text := pg_get_functiondef('public.bot_ai_context(text, bigint)'::regprocedure);
begin
  if position('workspace_transfer_in' in def) = 0 then
    def := replace(def, $r$'adjustment_in', 'adjustment_out'];$r$, $r$'adjustment_in', 'adjustment_out', 'workspace_transfer_in', 'workspace_transfer_out'];$r$);
    if position('workspace_transfer_in' in def) = 0 then
      raise exception 'bot_ai_context: list not found';
    end if;
    execute def;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bank alerts
-- ---------------------------------------------------------------------------
create table if not exists public.bank_alerts (
  user_id        uuid not null references auth.users (id) on delete cascade,
  fingerprint    text not null check (char_length(fingerprint) between 8 and 128),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (user_id, fingerprint)
);
alter table public.bank_alerts enable row level security;
revoke all on public.bank_alerts from anon, authenticated;

-- p_alert: {"amount": 50, "currency": "USD", "direction": "IN"|"OUT", "suffix": "6222",
--           "party": "SOK SAN", "ref": "123456789", "kind": "KHQR"|"TRANSFER"|"ALERT",
--           "fingerprint": "<sha256 of the alert>", "posted_at": "2026-10-05T10:15:00+07:00"}
create or replace function public.bot_bank_alert(p_key text, p_chat_id bigint, p_alert jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  amount numeric := (p_alert ->> 'amount')::numeric;
  cur text := p_alert ->> 'currency';
  dir text := p_alert ->> 'direction';
  suffix text := p_alert ->> 'suffix';
  fp text := p_alert ->> 'fingerprint';
  posted timestamptz;
  w public.wallets_accounts;
  ws public.workspaces;
  elsewhere text;
  existing uuid;
  category_id uuid;
  tx_id uuid;
  note text;
  numbers boolean;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if public.bot_tier(link.uid) = 'FREE' then
    return jsonb_build_object('status', 'plan_required');
  end if;
  if not coalesce(link.enabled, false) then
    return jsonb_build_object('status', 'commands_off');
  end if;
  if amount is null or amount <= 0 or amount >= 1e12 or cur not in ('USD', 'KHR') or dir not in ('IN', 'OUT')
     or suffix !~ '^\d{3,4}$' or coalesce(fp, '') !~ '^[a-f0-9]{16,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform public.bot_act_as(link.uid);

  -- The wallet whose name carries the account's last digits ("ACLEDA ••6222"), in a workspace this chat may log into.
  select x.* into w from public.wallets_accounts x
  where x.archived_at is null and x.name ~ ('(^|\D)' || suffix || '(\D|$)')
    and (x.visibility <> 'PERSONAL' or x.owner_id = link.uid)
    and public.bot_ws_allowed(link.uid, link.ws, link.route_all, x.workspace_id)
  order by (x.currency::text = cur) desc, x.created_at
  limit 1;
  if w.id is null then
    select ws2.name into elsewhere from public.wallets_accounts x join public.workspaces ws2 on ws2.id = x.workspace_id
    where x.archived_at is null and x.name ~ ('(^|\D)' || suffix || '(\D|$)') and public.can_write_workspace(x.workspace_id)
    limit 1;
    return jsonb_build_object('status', case when elsewhere is null then 'no_wallet' else 'other_workspace' end, 'workspace', elsewhere, 'suffix', suffix);
  end if;
  select * into ws from public.workspaces where id = w.workspace_id;

  select transaction_id into existing from public.bank_alerts where user_id = link.uid and fingerprint = fp;
  if found then
    return jsonb_build_object('status', 'duplicate', 'transaction_id', existing);
  end if;

  category_id := (
    select c.id from public.categories c
    where c.workspace_id = ws.id and c.type = case when dir = 'IN' then 'INCOME'::public.category_type else 'EXPENSE'::public.category_type end
      and c.preset_key = case when dir = 'OUT' then 'other_expense' when ws.type = 'BUSINESS' then 'sales' else 'other_income' end
    limit 1);
  begin
    posted := (p_alert ->> 'posted_at')::timestamptz;
  exception when others then
    posted := null;
  end;
  if posted is null or posted > now() + interval '1 day' or posted < now() - interval '400 days' then
    posted := now();
  end if;
  note := left(concat_ws(' · ',
            case when p_alert ->> 'kind' = 'KHQR' then 'KHQR' end,
            nullif(btrim(coalesce(p_alert ->> 'party', '')), ''),
            case when nullif(p_alert ->> 'ref', '') is not null then 'Ref ' || (p_alert ->> 'ref') end), 500);

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, exchange_rate, note, transaction_date, created_by)
  values (ws.id, w.id, category_id, round(amount, case when cur = 'KHR' then 0 else 2 end), cur::public.currency_code,
          case when dir = 'IN' then 'INCOME'::public.transaction_type else 'EXPENSE'::public.transaction_type end,
          case when cur <> w.currency::text then coalesce(ws.khr_per_usd, 4000) end, nullif(note, ''), posted, link.uid)
  returning id into tx_id;
  insert into public.bank_alerts (user_id, fingerprint, transaction_id) values (link.uid, fp, tx_id);

  select t.ai_numbers into numbers from public.telegram_links t where t.chat_id = p_chat_id;
  return jsonb_build_object(
    'status', 'ok', 'transaction_id', tx_id, 'wallet', w.name, 'workspace', ws.name, 'workspace_type', ws.type,
    'type', case when dir = 'IN' then 'INCOME' else 'EXPENSE' end, 'amount', amount, 'currency', cur, 'note', note,
    'balance', case when coalesce(numbers, false) then (select balance from public.wallets_accounts where id = w.id) end,
    'wallet_currency', w.currency
  );
end;
$$;
revoke all on function public.bot_bank_alert(text, bigint, jsonb) from public;
grant execute on function public.bot_bank_alert(text, bigint, jsonb) to anon, authenticated;

-- ↩️ Undo under an auto-logged alert: removes that entry (only one the bot made from an alert, for this person).
create or replace function public.bot_bank_undo(p_key text, p_chat_id bigint, p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if not exists (select 1 from public.bank_alerts where user_id = link.uid and transaction_id = p_transaction_id) then
    return jsonb_build_object('status', 'gone');
  end if;
  perform public.bot_act_as(link.uid);
  delete from public.bank_alerts where user_id = link.uid and transaction_id = p_transaction_id;
  delete from public.transactions where id = p_transaction_id;
  return jsonb_build_object('status', 'undone');
end;
$$;
revoke all on function public.bot_bank_undo(text, bigint, uuid) from public;
grant execute on function public.bot_bank_undo(text, bigint, uuid) to anon, authenticated;

select public.apply_security_gate();
