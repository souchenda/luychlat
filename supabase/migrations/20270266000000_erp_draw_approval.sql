-- The owner's draw from DL Staff waits for the founder's ✅ (founder, 26/10/2026 — Task #521, Option B of the security review).
-- Before: an «owner_salary» typed in DL Staff — by anyone allowed to record expenses there — put the same amount straight
-- into the founder's Personal wallet. Now the draw is recorded in DL MEAT SUPPLY at once (the business's books stay the ERP's),
-- and the Personal side waits: erp_sync_apply marks it «pending» with a short token and hands the route the founder's
-- private chat; the bot sends him a card — [ ✅ យល់ព្រមទទួលចូលកាបូបផ្ទាល់ខ្លួន ] [ ❌ បដិសេធ ]; erp_draw_decide:
--   ✅  the mirror into the configured Personal wallet of that currency (as before), «approved»;
--   ❌  no Personal entry; the business entry keeps its draw and says so in its note (for the audit), «rejected».
-- Only the DL workspace's OWNER, from his own linked chat, decides; once (a second tap changes nothing); a draw voided in
-- DL Staff meanwhile makes its card answer «voided» (and an approved mirror goes with the void, as before).
alter table public.erp_sync_events add column if not exists draw_state text check (draw_state is null or draw_state in ('pending', 'approved', 'rejected'));
alter table public.erp_sync_events add column if not exists draw_token text;
alter table public.erp_sync_events add column if not exists draw_decided_at timestamptz;
create unique index if not exists erp_sync_events_draw_token_key on public.erp_sync_events (draw_token) where draw_token is not null;

create or replace function public.erp_sync_apply(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.erp_sync_config;
  ws public.workspaces;
  ev public.erp_sync_events;
  ref text := btrim(coalesce(p_payload->>'reference_id', ''));
  v_type text := p_payload->>'type';
  v_kind text;
  v_cur text := p_payload->>'currency';
  v_amount numeric := (p_payload->>'amount')::numeric;
  v_method text := coalesce(p_payload->>'payment_method', 'bank');
  v_preset text := p_payload->>'preset';
  v_bref text := nullif(lower(btrim(coalesce(p_payload->>'bank_ref', ''))), '');
  v_when timestamptz;
  w public.wallets_accounts;
  old public.transactions;
  t public.transactions;
  pw public.wallets_accounts;
  pws public.workspaces;
  cat uuid;
  c_in uuid;
  tx uuid;
  mirror uuid;
  v_note text;
  draw_status text := null;
  v_matched text := null;
  v_token text := null;
  v_chat bigint := null;
begin
  perform public.require_bot(p_key);
  if ref = '' or char_length(ref) > 120 then raise exception 'invalid_reference' using errcode = '22023'; end if;
  select * into cfg from public.erp_sync_config where id = 1;
  select * into ws from public.workspaces where id = cfg.workspace_id;
  if ws.id is null then raise exception 'not_configured' using errcode = 'P0001'; end if;
  -- The business only: a Personal or Family workspace is never the ERP's destination.
  if ws.type <> 'BUSINESS' then raise exception 'not_business' using errcode = 'P0001'; end if;
  select * into ev from public.erp_sync_events where reference_id = ref;

  if coalesce(p_payload->>'action', 'create') = 'void' then
    if ev.reference_id is null then return jsonb_build_object('status', 'unknown', 'reference_id', ref); end if;
    if ev.voided_at is not null then return jsonb_build_object('status', 'already_void', 'reference_id', ref); end if;
    if ev.matched_by is not null then
      -- The bank's own entry: kept — its note and category back, the ERP's link gone (Task #518).
      perform set_config('luychlat.erp_apply', '1', true);
      update public.transactions
         set note = ev.original_note, category_id = coalesce(ev.original_category, category_id)
       where id = ev.transaction_id and workspace_id = ws.id;
      -- A Personal mirror the ERP made for an owner's draw goes (the category change removes it too — owner_draw_follow).
      if ev.mirror_id is not null then delete from public.transactions where id = ev.mirror_id; end if;
      perform set_config('luychlat.erp_apply', '', true);
      update public.erp_sync_events set voided_at = now() where reference_id = ref;
      return jsonb_build_object('status', 'unlinked', 'reference_id', ref, 'transaction_id', ev.transaction_id);
    end if;
    delete from public.transactions where id = ev.transaction_id and workspace_id = ws.id;
    update public.erp_sync_events set voided_at = now() where reference_id = ref;
    return jsonb_build_object('status', 'voided', 'reference_id', ref);
  end if;

  -- Once per ERP entry: a retry (or a duplicate send) answers with the entry already recorded.
  if ev.reference_id is not null then
    return jsonb_build_object('status', case when ev.voided_at is null then 'duplicate' else 'voided_before' end, 'reference_id', ref,
      'transaction_id', ev.transaction_id, 'mirror_id', ev.mirror_id);
  end if;
  if v_type not in ('income', 'expense', 'owner_draw') then raise exception 'invalid_type' using errcode = '22023'; end if;
  if v_cur not in ('USD', 'KHR') then raise exception 'invalid_currency' using errcode = '22023'; end if;
  if v_amount is null or v_amount <= 0 or (v_cur = 'KHR' and v_amount <> round(v_amount)) or v_amount <> round(v_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_bref is not null and v_bref !~ '^[a-z0-9-]{4,40}$' then raise exception 'invalid_bank_ref' using errcode = '22023'; end if;
  v_kind := case when v_type = 'income' then 'INCOME' else 'EXPENSE' end;

  -- The business wallet for this payment method and currency, as configured — never a guess.
  select * into w from public.wallets_accounts
   where id = nullif(cfg.accounts->>(v_method || ':' || v_cur), '')::uuid and workspace_id = ws.id and archived_at is null;
  if w.id is null then raise exception 'unmapped_account' using errcode = 'P0001', detail = v_method || ':' || v_cur; end if;
  if w.currency::text <> v_cur then raise exception 'currency_mismatch' using errcode = 'P0001', detail = v_method || ':' || v_cur; end if;

  if v_type = 'owner_draw' then
    cat := public.ensure_preset_category(ws.id, 'owner_draw', 'EXPENSE', 'hand-coins', '#64748b', 'ម្ចាស់ដកប្រើ / ផ្ទេរទៅខ្លួនឯង');
  else
    select id into cat from public.categories
     where workspace_id = ws.id and type::text = v_kind and preset_key = v_preset
     order by created_at limit 1;
    if cat is null then
      cat := case when v_type = 'income'
        then public.ensure_preset_category(ws.id, 'other_income', 'INCOME', 'coins', '#64748b', 'ចំណូលផ្សេងៗ')
        else public.ensure_preset_category(ws.id, 'other_expense', 'EXPENSE', 'ellipsis', '#64748b', 'ចំណាយផ្សេងៗ') end;
    end if;
  end if;

  v_when := case
    when p_payload->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then ((p_payload->>'date') || ' 12:00')::timestamp at time zone 'Asia/Phnom_Penh'
    when nullif(p_payload->>'date', '') is not null then (p_payload->>'date')::timestamptz
    else now() end;
  -- The ERP's words, its category when it was not one of ours, and its reference — «ERP #…» finds it again.
  v_note := left(concat_ws(' · ', nullif(btrim(p_payload->>'note'), ''),
    case when nullif(btrim(p_payload->>'category'), '') is not null and p_payload->>'category' <> v_preset then '[' || btrim(p_payload->>'category') || ']' end,
    'ERP #' || ref), 480);

  -- 1a. The same bank payment already here by its reference (AUTOBOK, a slip): taken over, never a second entry.
  if v_bref is not null then
    select t0.* into old from public.transactions t0
     where t0.workspace_id = ws.id and lower(t0.bank_ref) = v_bref and t0.currency::text = v_cur and t0.amount = v_amount and t0.type::text = v_kind
       and not exists (select 1 from public.erp_sync_events e where e.transaction_id = t0.id and e.voided_at is null)
     order by t0.created_at limit 1;
    if old.id is not null then v_matched := 'bank_ref'; end if;
  -- 1b. No reference (a delivery paid by KHQR): the bank's entry of that day, wallet and exact amount (Task #518).
  elsif v_type = 'income' and v_method in ('aba', 'acleda') then
    select t0.* into old from public.transactions t0
     where t0.workspace_id = ws.id and t0.wallet_id = w.id and t0.type = 'INCOME' and t0.currency::text = v_cur and t0.amount = v_amount
       and t0.bank_ref is not null
       and (t0.transaction_date at time zone 'Asia/Phnom_Penh')::date = (v_when at time zone 'Asia/Phnom_Penh')::date
       and not exists (select 1 from public.erp_sync_events e where e.transaction_id = t0.id and e.voided_at is null)
     order by t0.transaction_date, t0.created_at limit 1;
    if old.id is not null then v_matched := 'amount_day'; end if;
  end if;

  -- (erp_adopt_late must not take the ERP's own insert for a bank payment arriving later.)
  perform set_config('luychlat.erp_apply', '1', true);
  if old.id is not null then
    update public.transactions
       set category_id = cat,
           note = left(concat_ws(' · ', nullif(old.note, ''), v_note, case when v_matched = 'amount_day' then public.erp_match_tag() end), 480)
     where id = old.id;
    tx := old.id;
  else
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by, bank_ref)
    values (ws.id, w.id, cat, v_amount, v_cur::public.currency_code, v_kind::public.transaction_type, v_note, v_when, ws.user_id, v_bref)
    returning id into tx;
  end if;

  -- The owner's draw (Task #521 — Option B): recorded in the business now; the Personal wallet only after the founder's
  -- ✅ on the Telegram card (erp_draw_decide). A mirror the entry already had (a draw the founder made in the bot) stays.
  if v_type = 'owner_draw' then
    select id into mirror from public.transactions where draw_of = tx;
    if mirror is not null then
      draw_status := 'mirrored';
      mirror := null; -- not the ERP's: a void never removes it
    else
      select * into pw from public.wallets_accounts where id = nullif(cfg.draw_wallets->>v_cur, '')::uuid and archived_at is null;
      select * into pws from public.workspaces where id = pw.workspace_id;
      if pw.id is null then
        draw_status := 'no_draw_wallet';
      elsif pws.type <> 'PERSONAL' or pws.user_id <> ws.user_id or pw.currency::text <> v_cur or coalesce(pw.kind::text, '') = 'CREDIT_CARD' then
        draw_status := 'invalid_draw_wallet';
      else
        draw_status := 'pending_approval';
        v_token := substr(md5(random()::text || clock_timestamp()::text || ref), 1, 10);
        select l.chat_id into v_chat from public.telegram_links l where l.user_id = ws.user_id;
      end if;
    end if;
  end if;
  perform set_config('luychlat.erp_apply', '', true);

  insert into public.erp_sync_events (reference_id, transaction_id, mirror_id, payload, bank_ref, matched_by, original_note, original_category, bank_wallet,
                                      draw_state, draw_token)
  values (ref, tx, mirror, p_payload, v_bref, v_matched, case when v_matched is not null then old.note end, case when v_matched is not null then old.category_id end,
          case when v_type = 'income' and v_method in ('aba', 'acleda') and v_bref is null and v_matched is null then w.id end,
          case when v_token is not null then 'pending' end, v_token);
  return jsonb_build_object('status', case when v_matched is not null then 'adopted' else 'created' end, 'matched_by', v_matched,
    'reference_id', ref, 'transaction_id', tx, 'mirror_id', mirror, 'draw', draw_status, 'workspace', ws.name, 'wallet', w.name,
    'category', (select preset_key from public.categories where id = cat),
    -- The card for the founder (only when a draw waits): his private chat, the token of its buttons, what it says.
    'draw_token', v_token, 'owner_chat', v_chat, 'personal_wallet', case when v_token is not null then pw.name end,
    'amount', v_amount, 'currency', v_cur, 'date', (v_when at time zone 'Asia/Phnom_Penh')::date);
end;
$$;
revoke all on function public.erp_sync_apply(text, jsonb) from public, anon, authenticated;
grant execute on function public.erp_sync_apply(text, jsonb) to anon, authenticated;

create or replace function public.erp_draw_decide(p_key text, p_chat_id bigint, p_token text, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  cfg public.erp_sync_config;
  ws public.workspaces;
  ev public.erp_sync_events;
  t public.transactions;
  pw public.wallets_accounts;
  pws public.workspaces;
  c_in uuid;
  mirror uuid;
begin
  perform public.require_bot(p_key);
  select * into ev from public.erp_sync_events where draw_token = p_token;
  if ev.reference_id is null then return jsonb_build_object('status', 'unknown'); end if;
  select * into cfg from public.erp_sync_config where id = 1;
  select * into ws from public.workspaces where id = cfg.workspace_id;
  -- The business's owner only, from his own linked chat.
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or ws.id is null or link.uid <> ws.user_id then raise exception 'not_owner' using errcode = '42501'; end if;
  if ev.voided_at is not null then return jsonb_build_object('status', 'voided', 'reference_id', ev.reference_id); end if;
  if ev.draw_state <> 'pending' then
    return jsonb_build_object('status', 'already', 'state', ev.draw_state, 'reference_id', ev.reference_id);
  end if;
  select * into t from public.transactions where id = ev.transaction_id and workspace_id = ws.id;
  if t.id is null then return jsonb_build_object('status', 'voided', 'reference_id', ev.reference_id); end if;

  if not p_approve then
    update public.transactions set note = left(concat_ws(' · ', nullif(note, ''), '🚫 មិនទទួលចូលកាបូបផ្ទាល់ខ្លួន'), 480) where id = t.id;
    update public.erp_sync_events set draw_state = 'rejected', draw_decided_at = now() where reference_id = ev.reference_id;
    return jsonb_build_object('status', 'rejected', 'reference_id', ev.reference_id, 'amount', t.amount, 'currency', t.currency);
  end if;

  -- The Personal wallet as configured NOW (it may have changed since the card was sent), checked again.
  select * into pw from public.wallets_accounts where id = nullif(cfg.draw_wallets->>t.currency::text, '')::uuid and archived_at is null;
  select * into pws from public.workspaces where id = pw.workspace_id;
  if pw.id is null or pws.type <> 'PERSONAL' or pws.user_id <> ws.user_id or pw.currency <> t.currency or coalesce(pw.kind::text, '') = 'CREDIT_CARD' then
    return jsonb_build_object('status', 'no_draw_wallet', 'reference_id', ev.reference_id);
  end if;
  select id into mirror from public.transactions where draw_of = t.id;
  if mirror is null then
    c_in := public.ensure_preset_category(pws.id, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
    insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by, draw_of)
    values (pws.id, pw.id, c_in, t.amount, t.currency, 'INCOME', left(concat_ws(' · ', '← ' || ws.name, 'ម្ចាស់ដកចាយ', 'ERP #' || ev.reference_id), 480),
            t.transaction_date, ws.user_id, t.id)
    returning id into mirror;
  end if;
  update public.erp_sync_events set draw_state = 'approved', draw_decided_at = now(), mirror_id = mirror where reference_id = ev.reference_id;
  return jsonb_build_object('status', 'approved', 'reference_id', ev.reference_id, 'amount', t.amount, 'currency', t.currency,
    'wallet', pw.name, 'account_no', pw.account_no);
end;
$$;
revoke all on function public.erp_draw_decide(text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.erp_draw_decide(text, bigint, text, boolean) to anon, authenticated;

select public.apply_security_gate();
