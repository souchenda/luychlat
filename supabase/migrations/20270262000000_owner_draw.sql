-- Business slips and the owner's draw (founder, 26/10/2026 — Task #510). A slip paid from a Business account (DL MEAT
-- SUPPLY's «ABA DL USD») stays in that business and offers business categories; one of them is «🙋‍♂️ ម្ចាស់ដកចាយ»:
--
-- 1. bot_tx_scope: the workspace of the person's own recent slip entry — the bot looks a tapped category up THERE,
--    never in the chat's first (Personal) workspace (the tap on the $370 DL slip of 26/10 found a Personal category and
--    the database refused it: «invalid_category»).
-- 2. bot_owner_draw: the business entry becomes the owner's draw (owner_draw — equity, kept out of the business P&L,
--    lib/categories/presets.ts › ADJUSTMENT_KEYS); with the Personal wallet the owner names (never guessed), the same
--    amount arrives there as «← DL MEAT SUPPLY · ម្ចាស់ដកចាយ» (workspace_transfer_in — a transfer, not personal income).
--    Only the business's OWNER, only Business → their own Personal, the same currency, both workspaces writable by the
--    bot. One mirror per draw (transactions.draw_of, unique); deleting the business entry deletes it.
-- 3. The mirror follows its draw: the category changed away from the owner's draw → the mirror goes; the amount,
--    currency or date edited → the mirror follows.
alter table public.transactions add column if not exists draw_of uuid references public.transactions (id) on delete cascade;
create unique index if not exists transactions_draw_of_key on public.transactions (draw_of) where draw_of is not null;

-- The linked user's own slip entry of the last 30 days (the same rule as bot_slip_recategorize).
create or replace function public.bot_own_slip_tx(p_chat_id bigint, p_tx_id uuid)
returns public.transactions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
begin
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select * into t from public.transactions
   where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '30 days'
     and receipt_url like link.uid::text || '/tg/%';
  return t;
end;
$$;
revoke all on function public.bot_own_slip_tx(bigint, uuid) from public, anon, authenticated;

create or replace function public.bot_tx_scope(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transactions;
  w public.workspaces;
begin
  perform public.require_bot(p_key);
  t := public.bot_own_slip_tx(p_chat_id, p_tx_id);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select * into w from public.workspaces where id = t.workspace_id;
  return jsonb_build_object('ok', true, 'workspace_id', w.id, 'workspace', w.name, 'type', w.type, 'currency', t.currency,
    'drawn', exists (select 1 from public.transactions m where m.draw_of = t.id));
end;
$$;
revoke all on function public.bot_tx_scope(text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.bot_tx_scope(text, bigint, uuid) to anon, authenticated;

create or replace function public.bot_owner_draw(p_key text, p_chat_id bigint, p_tx_id uuid, p_wallet_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  bw public.workspaces;
  pw public.workspaces;
  w public.wallets_accounts;
  c_draw uuid;
  c_in uuid;
  slip text;
  mirror uuid;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  t := public.bot_own_slip_tx(p_chat_id, p_tx_id);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  select * into bw from public.workspaces where id = t.workspace_id;
  if bw.type <> 'BUSINESS' then raise exception 'not_business' using errcode = '22023'; end if;
  -- The owner's money only: a member of someone else's business cannot draw from it.
  if bw.user_id <> link.uid then raise exception 'not_owner' using errcode = '42501'; end if;

  c_draw := public.ensure_preset_category(bw.id, 'owner_draw', 'EXPENSE', 'hand-coins', '#64748b', 'ម្ចាស់ដកប្រើ / ផ្ទេរទៅខ្លួនឯង');
  update public.transactions set category_id = c_draw, subcategory = null, need_want = null where id = t.id returning * into t;

  if p_wallet_id is not null then
    select * into w from public.wallets_accounts where id = p_wallet_id and archived_at is null;
    select * into pw from public.workspaces where id = w.workspace_id;
    if w.id is null or pw.type <> 'PERSONAL' or pw.user_id <> link.uid or coalesce(w.kind::text, '') = 'CREDIT_CARD' then
      raise exception 'invalid_wallet' using errcode = '22023';
    end if;
    if w.currency <> t.currency then raise exception 'currency_mismatch' using errcode = '22023'; end if;
    if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, pw.id) then raise exception 'not_writable' using errcode = '42501'; end if;
    c_in := public.ensure_preset_category(pw.id, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
    select s into slip from unnest(string_to_array(coalesce(t.note, ''), ' · ')) s where s like '🧾%' limit 1;
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by, draw_of)
    values (pw.id, w.id, c_in, t.amount, t.currency, 'INCOME', left(concat_ws(' · ', '← ' || bw.name, 'ម្ចាស់ដកចាយ', slip), 480),
            t.transaction_date, link.uid, t.id)
    on conflict (draw_of) where draw_of is not null do update set wallet_id = excluded.wallet_id, workspace_id = excluded.workspace_id, category_id = excluded.category_id
    returning id into mirror;
  end if;
  return jsonb_build_object('ok', true, 'tx_id', t.id, 'business', bw.name, 'amount', t.amount, 'currency', t.currency,
    'mirror_id', mirror, 'personal_wallet', w.name, 'personal_account_no', w.account_no);
end;
$$;
revoke all on function public.bot_owner_draw(text, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bot_owner_draw(text, bigint, uuid, uuid) to anon, authenticated;

-- The mirror follows its draw (bot taps and app edits alike).
create or replace function public.owner_draw_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.transactions m where m.draw_of = new.id) then return new; end if;
  if new.category_id is distinct from old.category_id
     and not exists (select 1 from public.categories c where c.id = new.category_id and c.preset_key = 'owner_draw') then
    delete from public.transactions where draw_of = new.id;
  elsif new.amount is distinct from old.amount or new.currency is distinct from old.currency or new.transaction_date is distinct from old.transaction_date then
    update public.transactions set amount = new.amount, currency = new.currency, transaction_date = new.transaction_date where draw_of = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.owner_draw_follow() from public, anon, authenticated;
drop trigger if exists owner_draw_follow on public.transactions;
create trigger owner_draw_follow after update of category_id, amount, currency, transaction_date on public.transactions
  for each row when (old.category_id is distinct from new.category_id or old.amount is distinct from new.amount
                     or old.currency is distinct from new.currency or old.transaction_date is distinct from new.transaction_date)
  execute function public.owner_draw_follow();

select public.apply_security_gate();
