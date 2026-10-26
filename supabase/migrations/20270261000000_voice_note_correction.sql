-- A typed text corrects the voice note just heard (founder, 26/10/2026 — Task #507: «the bot must adapt to humans»).
-- On the 9,000 ៛ ACLEDA slip of 26/10 06:57 the voice note «បាយព្រឹកកូនពៅ» was heard as «អាចង្របស្ពីភាត្របស្រៀល»; the
-- founder typed «បាយព្រឹកកូនពៅ» and got «⚠️ មិនអាចកត់ត្រាបានទេ».
--
-- 1. The failure: the category its words name was looked up with `type = t.type` — categories.type is category_type,
--    transactions.type is transaction_type, and Postgres has no operator between the two enums. Every follow-up note
--    that named a category (បាយ → food, សាំង → transport…) failed since 20270233000000. Compared as text now.
-- 2. A note added by voice is remembered on the card's prompt (bot_note_prompts.voice_note). The next text without an
--    amount within the 5 minutes REPLACES that heard part — a correction, «✏️ បានកែសម្រួលចំណាំជា៖ …» — instead of being
--    appended to it (Task #497's rule still holds for everything else: typed notes add up, the slip line stays last).
alter table public.bot_note_prompts add column if not exists voice_note text;

drop function if exists public.bot_tx_note_recent(text, bigint, text, text);
create or replace function public.bot_tx_note_recent(p_key text, p_chat_id bigint, p_note text, p_preset text default null, p_voice boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.bot_note_prompts;
  t public.transactions;
  slip text;
  kept text;
  clean text := left(nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), ''), 300);
  cat_id uuid;
  w_name text;
  w_acct text;
  c public.categories;
  moved boolean := false;
  corrected boolean := false;
begin
  perform public.require_bot(p_key);
  select * into pr from public.bot_note_prompts
   where chat_id = p_chat_id and card_msg = message_id and created_at > now() - interval '5 minutes'
   order by created_at desc limit 1;
  if pr.tx_id is null then return null; end if;
  if clean is null then raise exception 'empty_note' using errcode = '22023'; end if;
  t := public.bot_own_recent_tx(p_chat_id, pr.tx_id);
  if t.id is null then return null; end if;
  -- The category its words name, in the entry's own workspace and of its own type (two enums: compared as text).
  if nullif(btrim(p_preset), '') is not null then
    select id into cat_id from public.categories
     where workspace_id = t.workspace_id and type::text = t.type::text and preset_key = p_preset
     order by created_at limit 1;
  end if;
  -- A typed text right after a voice note: the correction of what was heard.
  corrected := not coalesce(p_voice, false) and pr.voice_note is not null and pr.voice_note <> clean
    and pr.voice_note = any(string_to_array(coalesce(t.note, ''), ' · '));
  select s into slip from unnest(string_to_array(coalesce(t.note, ''), ' · ')) s where s like '🧾%' limit 1;
  -- The notes already written (not the slip line, not this same text again, not the voice note it corrects), in order.
  select string_agg(s, ' · ' order by n) into kept
    from unnest(string_to_array(coalesce(t.note, ''), ' · ')) with ordinality as u(s, n)
   where s not like '🧾%' and btrim(s) <> '' and s <> clean and not (corrected and s = pr.voice_note);
  moved := cat_id is not null and cat_id is distinct from t.category_id;
  update public.transactions
     set note = left(concat_ws(' · ', kept, clean, slip), 500),
         category_id = coalesce(cat_id, category_id)
   where id = t.id returning * into t;
  -- Remember a voice note (the next text may correct it, and its 5 minutes count from now); a typed one clears it.
  update public.bot_note_prompts
     set voice_note = case when coalesce(p_voice, false) then clean end,
         created_at = case when coalesce(p_voice, false) and card_msg = message_id then now() else created_at end
   where chat_id = p_chat_id and tx_id = t.id;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'tx_id', t.id, 'card_msg', pr.card_msg, 'note', t.note, 'user_note', clean, 'moved', moved,
    'corrected', corrected,
    'type', t.type, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want, 'for_child', t.for_child);
end;
$$;
revoke all on function public.bot_tx_note_recent(text, bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bot_tx_note_recent(text, bigint, text, text, boolean) to anon, authenticated;

-- 3. A voice reply to the [📝 បន្ថែមចំណាំ] prompt (the founder's case): the same, so the typed text after it corrects it.
drop function if exists public.bot_tx_note(text, bigint, bigint, text);
create or replace function public.bot_tx_note(p_key text, p_chat_id bigint, p_prompt_message_id bigint, p_note text, p_voice boolean default false)
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
  update public.bot_note_prompts
     set voice_note = case when coalesce(p_voice, false) then clean end,
         created_at = case when coalesce(p_voice, false) and card_msg = message_id then now() else created_at end
   where chat_id = p_chat_id and tx_id = t.id;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'tx_id', t.id, 'card_msg', pr.card_msg, 'note', t.note, 'user_note', clean,
    'type', t.type, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want, 'for_child', t.for_child);
end;
$$;
revoke all on function public.bot_tx_note(text, bigint, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.bot_tx_note(text, bigint, bigint, text, boolean) to anon, authenticated;

select public.apply_security_gate();
