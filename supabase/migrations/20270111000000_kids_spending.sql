-- Spending on the children (ចំណាយលើកូន): a flag on an expense — school fees,
-- milk, diapers, the child's lunch at school — set with one tap on the bot's
-- saved card ([👶 សម្រាប់កូន]), and automatically when the note says so.
-- Home and Reports total it by month.

alter table public.transactions add column if not exists for_child boolean not null default false;
create index if not exists transactions_for_child_idx on public.transactions (workspace_id, transaction_date) where for_child;

-- An expense whose note names a child or school things starts flagged (the user can untick it).
create or replace function public.guess_for_child()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'EXPENSE' and not new.for_child
     and coalesce(new.note, '') ~* '(កូន|សាលា|ថ្លៃរៀន|ទឹកដោះគោម្សៅ|ទឹកដោះគោកូន|ក្រណាត់កន្ទប|កន្ទបកូន|សម្ភារៈសិក្សា|\m(kids?|child|children|baby|school|tuition|diapers?|nappies|formula)\M)' then
    new.for_child := true;
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_guess_for_child on public.transactions;
create trigger transactions_guess_for_child before insert on public.transactions
  for each row execute function public.guess_for_child();

drop function if exists public.bot_tx_tag(text, bigint, uuid, text, text);
create or replace function public.bot_tx_tag(p_key text, p_chat_id bigint, p_tx_id uuid, p_subcategory text default null, p_need_want text default null, p_for_child boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  w_name text;
  w_acct text;
  c public.categories;
begin
  perform public.require_bot(p_key);
  if p_subcategory is not null and p_subcategory not in ('breakfast', 'lunch', 'dinner', 'snack') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  if p_need_want is not null and p_need_want not in ('NEED', 'WANT') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;

  select * into t from public.transactions
   where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '30 days';
  if t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;

  update public.transactions
     set subcategory = coalesce(p_subcategory, subcategory),
         need_want = coalesce(p_need_want, need_want),
         for_child = coalesce(p_for_child, for_child)
   where id = t.id
  returning * into t;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct, 'note', t.note,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want, 'for_child', t.for_child);
end;
$$;
revoke all on function public.bot_tx_tag(text, bigint, uuid, text, text, boolean) from public;
grant execute on function public.bot_tx_tag(text, bigint, uuid, text, text, boolean) to anon, authenticated;

create or replace function public.bot_tx_note(p_key text, p_chat_id bigint, p_prompt_message_id bigint, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.bot_note_prompts;
  t public.transactions;
  slip text;
  clean text := left(nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), ''), 300);
  w_name text;
  w_acct text;
  c public.categories;
begin
  perform public.require_bot(p_key);
  select * into pr from public.bot_note_prompts where chat_id = p_chat_id and message_id = p_prompt_message_id;
  if pr.tx_id is null then return null; end if;
  if clean is null then raise exception 'empty_note' using errcode = '22023'; end if;
  t := public.bot_own_recent_tx(p_chat_id, pr.tx_id);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  -- Keep the slip's own part ("🧾 ACLEDA Bank → …"); the user's words replace the rest.
  select s into slip from unnest(string_to_array(coalesce(t.note, ''), ' · ')) s where s like '🧾%' limit 1;
  update public.transactions set note = left(concat_ws(' · ', clean, slip), 500) where id = t.id returning * into t;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'tx_id', t.id, 'card_msg', pr.card_msg, 'note', t.note, 'user_note', clean,
    'type', t.type, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want, 'for_child', t.for_child);
end;
$$;

select public.apply_security_gate();
