-- ERP ↔ bank matching, refined (founder, 26/10/2026 — Task #518).
--
-- 1. A bank payment the ERP sends WITHOUT a bank reference (a delivery paid by KHQR: the ERP keeps no reference for a
--    slip's bank part) is matched with the bank's own entry already in DL — AUTOBOK's or a bank alert's: INCOME, the same
--    DL bank wallet (the ERP's account as configured), the same currency, the exact amount, the same Cambodian day, an
--    entry the bank recorded (it has a bank reference) and not already the ERP's. Either order: the ERP after the bank
--    (erp_sync_apply takes it) or the bank after the ERP (erp_adopt_late keeps the bank's entry — the SoundBox rings for
--    its id — and merges the ERP's into it). Never silent: the entry's note says
--    «🔗 ផ្គូផ្គងស្វ័យប្រវត្តិតាមកាលបរិច្ឆេទ និងទឹកប្រាក់ ERP». Two equal payments the same day in the same wallet are
--    interchangeable for the books: the earliest one not yet matched is taken.
-- 2. A «void» from the ERP for an entry that was the bank's (matched by reference or by date and amount) never deletes the
--    bank's entry: its own note and category come back and the link to the ERP is removed (erp_sync_events keeps the
--    history). An entry the ERP created itself is deleted as before (its Personal mirror with it).
alter table public.erp_sync_events add column if not exists matched_by text check (matched_by is null or matched_by in ('bank_ref', 'amount_day'));
alter table public.erp_sync_events add column if not exists original_note text;
alter table public.erp_sync_events add column if not exists original_category uuid;
alter table public.erp_sync_events add column if not exists bank_wallet uuid;

/** The note tag of a match by date and amount (the founder's words). */
create or replace function public.erp_match_tag() returns text language sql immutable as $$
  select '🔗 ផ្គូផ្គងស្វ័យប្រវត្តិតាមកាលបរិច្ឆេទ និងទឹកប្រាក់ ERP'
$$;

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

  -- The owner's draw: the same amount into the owner's Personal wallet of that currency (Task #510's mirror) — once.
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
        c_in := public.ensure_preset_category(pws.id, 'workspace_transfer_in', 'INCOME', 'arrow-left-right', '#64748b', 'ផ្ទេរពីកន្លែងធ្វើការផ្សេង');
        insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by, draw_of)
        values (pws.id, pw.id, c_in, v_amount, v_cur::public.currency_code, 'INCOME', left(concat_ws(' · ', '← ' || ws.name, 'ម្ចាស់ដកចាយ', 'ERP #' || ref), 480),
                v_when, ws.user_id, tx)
        returning id into mirror;
        draw_status := 'mirrored';
      end if;
    end if;
  end if;
  perform set_config('luychlat.erp_apply', '', true);

  insert into public.erp_sync_events (reference_id, transaction_id, mirror_id, payload, bank_ref, matched_by, original_note, original_category, bank_wallet)
  values (ref, tx, mirror, p_payload, v_bref, v_matched, case when v_matched is not null then old.note end, case when v_matched is not null then old.category_id end,
          case when v_type = 'income' and v_method in ('aba', 'acleda') and v_bref is null and v_matched is null then w.id end);
  return jsonb_build_object('status', case when v_matched is not null then 'adopted' else 'created' end, 'matched_by', v_matched,
    'reference_id', ref, 'transaction_id', tx, 'mirror_id', mirror, 'draw', draw_status, 'workspace', ws.name, 'wallet', w.name,
    'category', (select preset_key from public.categories where id = cat));
end;
$$;
revoke all on function public.erp_sync_apply(text, jsonb) from public, anon, authenticated;
grant execute on function public.erp_sync_apply(text, jsonb) to anon, authenticated;

-- The bank after the ERP: by its reference, or — an ERP bank income sent without one (erp_sync_events.bank_wallet) — by
-- that wallet, the exact amount and the same Cambodian day. The bank's entry stays; the ERP's merges into it.
create or replace function public.erp_adopt_late()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.erp_sync_events;
  e public.transactions;
  draw_cat boolean;
  by_day boolean := false;
begin
  if coalesce(current_setting('luychlat.erp_apply', true), '') = '1' then return new; end if;
  select x.* into ev from public.erp_sync_events x
   where x.bank_ref = lower(new.bank_ref) and x.voided_at is null and x.transaction_id is not null and x.transaction_id <> new.id
   limit 1;
  if ev.reference_id is null and new.type = 'INCOME' then
    select x.* into ev from public.erp_sync_events x join public.transactions et on et.id = x.transaction_id
     where x.bank_wallet = new.wallet_id and x.voided_at is null and x.matched_by is null and x.transaction_id <> new.id
       and et.amount = new.amount and et.currency = new.currency and et.type = 'INCOME'
       and (et.transaction_date at time zone 'Asia/Phnom_Penh')::date = (new.transaction_date at time zone 'Asia/Phnom_Penh')::date
     order by x.received_at limit 1;
    by_day := ev.reference_id is not null;
  end if;
  if ev.reference_id is null then return new; end if;
  select * into e from public.transactions
   where id = ev.transaction_id and workspace_id = new.workspace_id and amount = new.amount and currency = new.currency and type = new.type;
  if e.id is null then return new; end if;
  draw_cat := exists (select 1 from public.categories c where c.id = e.category_id and c.preset_key = 'owner_draw');
  -- The mirror and the ERP's record follow the kept entry first (the mirror would go with the ERP's entry otherwise);
  -- the bank's own note and category are remembered, so a later void gives them back.
  update public.transactions set draw_of = new.id where draw_of = e.id;
  update public.erp_sync_events
     set transaction_id = new.id, matched_by = case when by_day then 'amount_day' else 'bank_ref' end,
         original_note = new.note, original_category = new.category_id, bank_wallet = null
   where reference_id = ev.reference_id;
  -- Its own category stays (the SoundBox checks a sale's), unless it has none or the ERP says it is the owner's draw.
  update public.transactions
     set note = left(concat_ws(' · ', nullif(new.note, ''), nullif(e.note, ''), case when by_day then public.erp_match_tag() end), 480),
         category_id = case when new.category_id is null or draw_cat then e.category_id else new.category_id end
   where id = new.id;
  delete from public.transactions where id = e.id;
  return new;
end;
$$;
revoke all on function public.erp_adopt_late() from public, anon, authenticated;

select public.apply_security_gate();
