-- Notes on bank slips: what was bought and for whom.
--
-- 1. The photo's caption becomes the note when the slip is read (bot side).
-- 2. [📝 បន្ថែមចំណាំ] under a saved slip sends a prompt; the user replies with
--    text or a voice note. bot_note_prompts remembers which prompt belongs to
--    which entry (and which card to redraw) — it survives restarts and deploys.
-- 3. bot_tx_note sets the note: the user's words first, keeping the slip's own
--    "🧾 bank → payee" part, so editing again replaces rather than stacks.
--    Same rules as bot_tx_tag: the linked user's own expense or income from the
--    last 30 days, in a workspace the bot may write to, on a paid plan.
-- bot_tx_tag also returns the note (the card shows it).

create table if not exists public.bot_note_prompts (
  chat_id     bigint not null,
  message_id  bigint not null,
  tx_id       uuid not null references public.transactions (id) on delete cascade,
  card_msg    bigint,
  created_at  timestamptz not null default now(),
  primary key (chat_id, message_id)
);
alter table public.bot_note_prompts enable row level security;
revoke all on public.bot_note_prompts from anon, authenticated;

-- The linked user's own recent entry (what both functions below may touch).
create or replace function public.bot_own_recent_tx(p_chat_id bigint, p_tx_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
begin
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  if public.plan_code_of(link.uid) = 'FREE' then raise exception 'plan_required' using errcode = 'P0001'; end if;
  select * into t from public.transactions
   where id = p_tx_id and created_by = link.uid and type in ('EXPENSE', 'INCOME') and created_at > now() - interval '30 days';
  if t.id is null then return null; end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  return t;
end;
$$;
revoke all on function public.bot_own_recent_tx(bigint, uuid) from public, anon, authenticated;

create or replace function public.bot_note_prompt_set(p_key text, p_chat_id bigint, p_message_id bigint, p_tx_id uuid, p_card_msg bigint default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transactions;
begin
  perform public.require_bot(p_key);
  t := public.bot_own_recent_tx(p_chat_id, p_tx_id);
  if t.id is null then return false; end if;
  delete from public.bot_note_prompts where created_at < now() - interval '2 days';
  insert into public.bot_note_prompts (chat_id, message_id, tx_id, card_msg) values (p_chat_id, p_message_id, p_tx_id, p_card_msg)
  on conflict (chat_id, message_id) do update set tx_id = excluded.tx_id, card_msg = excluded.card_msg, created_at = now();
  return true;
end;
$$;

-- The reply to a note prompt: null when that message isn't one (the reply is then handled normally).
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
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.bot_note_prompt_set(text, bigint, bigint, uuid, bigint)', 'public.bot_tx_note(text, bigint, bigint, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

create or replace function public.bot_tx_tag(p_key text, p_chat_id bigint, p_tx_id uuid, p_subcategory text default null, p_need_want text default null)
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
         need_want = coalesce(p_need_want, need_want)
   where id = t.id
  returning * into t;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct, 'note', t.note,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want);
end;
$$;

select public.apply_security_gate();

-- Daily tip posters from a designer (Canva…) are often large: allow up to 10 MB (Telegram's photo limit).
update storage.buckets set file_size_limit = 10485760 where id = 'tip-posters';
