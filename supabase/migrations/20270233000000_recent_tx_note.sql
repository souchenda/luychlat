-- A follow-up note on the transaction just recorded (founder, 20/10/2026 — after an ABA slip, «ចំណាយសំភារៈសិក្សាកូន»
-- got «🤔 រកមិនឃើញចំនួនទឹកប្រាក់ទេ»). The bot registers every saved card in bot_note_prompts (the card is its own
-- prompt: replying to it sets the note, as the [📝 បន្ថែមចំណាំ] prompt does). A text without an amount sent within 5
-- minutes of a saved card becomes that entry's note; when its words name a category (p_preset: school → education,
-- food, fuel…), the entry moves to the workspace's category with that preset (same type). Same rules as bot_tx_note:
-- the linked user's own recent entry, a writable workspace, a paid plan. Null when there is no card from the last 5
-- minutes (the text is then answered as usual).
create or replace function public.bot_tx_note_recent(p_key text, p_chat_id bigint, p_note text, p_preset text default null)
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
  cat_id uuid;
  w_name text;
  w_acct text;
  c public.categories;
  moved boolean := false;
begin
  perform public.require_bot(p_key);
  select * into pr from public.bot_note_prompts
   where chat_id = p_chat_id and card_msg = message_id and created_at > now() - interval '5 minutes'
   order by created_at desc limit 1;
  if pr.tx_id is null then return null; end if;
  if clean is null then raise exception 'empty_note' using errcode = '22023'; end if;
  t := public.bot_own_recent_tx(p_chat_id, pr.tx_id);
  if t.id is null then return null; end if;
  -- The category its words name, in the entry's own workspace and of its own type.
  if nullif(btrim(p_preset), '') is not null then
    select id into cat_id from public.categories
     where workspace_id = t.workspace_id and type = t.type and preset_key = p_preset
     order by created_at limit 1;
  end if;
  select s into slip from unnest(string_to_array(coalesce(t.note, ''), ' · ')) s where s like '🧾%' limit 1;
  moved := cat_id is not null and cat_id is distinct from t.category_id;
  update public.transactions
     set note = left(concat_ws(' · ', clean, slip), 500),
         category_id = coalesce(cat_id, category_id)
   where id = t.id returning * into t;
  select name, account_no into w_name, w_acct from public.wallets_accounts where id = t.wallet_id;
  select * into c from public.categories where id = t.category_id;
  return jsonb_build_object('ok', true, 'tx_id', t.id, 'card_msg', pr.card_msg, 'note', t.note, 'user_note', clean, 'moved', moved,
    'type', t.type, 'amount', t.amount, 'currency', t.currency, 'wallet', w_name, 'account_no', w_acct,
    'category', c.name, 'preset', c.preset_key, 'subcategory', t.subcategory, 'need_want', t.need_want, 'for_child', t.for_child);
end;
$$;
revoke all on function public.bot_tx_note_recent(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.bot_tx_note_recent(text, bigint, text, text) to anon, authenticated;

select public.apply_security_gate();
