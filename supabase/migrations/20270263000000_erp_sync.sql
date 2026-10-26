-- SL Staff ERP → LuyChlat (founder, 26/10/2026 — Task #515, phase 1 of #511). Decisions: the depot ERP is the source of
-- truth for DL MEAT SUPPLY's ledger; every entry it sends goes to that business workspace (never Personal); the owner's
-- draw is mirrored into the owner's Personal wallet of that currency; no SoundBox for ERP entries (nothing here rings).
--
-- erp_sync_config (one row): the business workspace, which of its wallets each payment method + currency books into
-- («bank:USD» → ABA DL USD …), and the Personal wallet per currency that receives an owner's draw. Nothing is guessed: an
-- unmapped method / currency is refused (the ERP's outbox keeps it and retries), an unset draw wallet records the draw in
-- the business only and says so.
-- erp_sync_events: one row per ERP reference_id — a repeated «create» answers «duplicate» with the same entry; «void»
-- deletes the entry (its Personal mirror goes with it, transactions.draw_of on delete cascade) and is remembered.
create table if not exists public.erp_sync_config (
  id            smallint primary key default 1 check (id = 1),
  workspace_id  uuid references public.workspaces (id) on delete set null,
  accounts      jsonb not null default '{}'::jsonb,
  draw_wallets  jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
alter table public.erp_sync_config enable row level security;
revoke all on public.erp_sync_config from anon, authenticated;
insert into public.erp_sync_config (id) values (1) on conflict do nothing;

create table if not exists public.erp_sync_events (
  reference_id    text primary key check (char_length(reference_id) between 1 and 120),
  transaction_id  uuid references public.transactions (id) on delete set null,
  mirror_id       uuid,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  voided_at       timestamptz
);
alter table public.erp_sync_events enable row level security;
revoke all on public.erp_sync_events from anon, authenticated;

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
  v_cur text := p_payload->>'currency';
  v_amount numeric := (p_payload->>'amount')::numeric;
  v_method text := coalesce(p_payload->>'payment_method', 'bank');
  v_preset text := p_payload->>'preset';
  v_when timestamptz;
  w public.wallets_accounts;
  pw public.wallets_accounts;
  pws public.workspaces;
  cat uuid;
  c_in uuid;
  tx uuid;
  mirror uuid;
  v_note text;
  draw_status text := null;
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

  -- The business wallet for this payment method and currency, as configured — never a guess.
  select * into w from public.wallets_accounts
   where id = nullif(cfg.accounts->>(v_method || ':' || v_cur), '')::uuid and workspace_id = ws.id and archived_at is null;
  if w.id is null then raise exception 'unmapped_account' using errcode = 'P0001', detail = v_method || ':' || v_cur; end if;
  if w.currency::text <> v_cur then raise exception 'currency_mismatch' using errcode = 'P0001', detail = v_method || ':' || v_cur; end if;

  if v_type = 'owner_draw' then
    cat := public.ensure_preset_category(ws.id, 'owner_draw', 'EXPENSE', 'hand-coins', '#64748b', 'ម្ចាស់ដកប្រើ / ផ្ទេរទៅខ្លួនឯង');
  else
    select id into cat from public.categories
     where workspace_id = ws.id and type::text = case when v_type = 'income' then 'INCOME' else 'EXPENSE' end and preset_key = v_preset
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

  insert into public.transactions (workspace_id, wallet_id, category_id, amount, currency, type, note, transaction_date, created_by)
  values (ws.id, w.id, cat, v_amount, v_cur::public.currency_code, (case when v_type = 'income' then 'INCOME' else 'EXPENSE' end)::public.transaction_type,
          v_note, v_when, ws.user_id)
  returning id into tx;

  -- The owner's draw: the same amount into the owner's Personal wallet of that currency (Task #510's mirror).
  if v_type = 'owner_draw' then
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

  insert into public.erp_sync_events (reference_id, transaction_id, mirror_id, payload) values (ref, tx, mirror, p_payload);
  return jsonb_build_object('status', 'created', 'reference_id', ref, 'transaction_id', tx, 'mirror_id', mirror, 'draw', draw_status,
    'workspace', ws.name, 'wallet', w.name, 'category', (select preset_key from public.categories where id = cat));
end;
$$;
revoke all on function public.erp_sync_apply(text, jsonb) from public, anon, authenticated;
grant execute on function public.erp_sync_apply(text, jsonb) to anon, authenticated;

select public.apply_security_gate();
