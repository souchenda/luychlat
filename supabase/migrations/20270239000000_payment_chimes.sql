-- The payment chime's second trigger (founder, 21/10/2026 — lib/payment-chime.ts): an income slip scanned and confirmed
-- in the bot (a private chat's category tap, a business group's slip) rings the counter phone «ទីង-ទីង» with
-- «💰 ទទួលបានប្រាក់ +50,000 ៛ · វិក្កយបត្រ ABA · កត់ត្រាជោគជ័យ». Its own table: the SoundBox (soundbox_events — the real-time
-- KHQR sales, the golden «sales only» rule) is untouched.
--
-- Rings only for: INCOME (never an expense, a transfer or a loan repayment — debt_id), in a BUSINESS workspace (the
-- counter), once per transaction, and never when the same bank reference already rang as a KHQR sale (or as a slip).
create table if not exists public.payment_chimes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  amount numeric(18, 2) not null,
  currency text not null check (currency in ('KHR', 'USD')),
  bank text check (bank is null or char_length(bank) <= 60),
  source text not null default 'slip' check (source in ('slip')),
  created_at timestamptz not null default now()
);
create index if not exists payment_chimes_ws_idx on public.payment_chimes (workspace_id, created_at desc);
alter table public.payment_chimes enable row level security;
revoke all on public.payment_chimes from anon, authenticated;
grant select on public.payment_chimes to authenticated;
drop policy if exists payment_chimes_member on public.payment_chimes;
create policy payment_chimes_member on public.payment_chimes
  for select to authenticated using (public.is_workspace_member(workspace_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_chimes') then
    alter publication supabase_realtime add table public.payment_chimes;
  end if;
end $$;

-- Server (bot key): a confirmed slip's chime. 'ok', or 'skipped' with why (never an error for the bot's reply).
create or replace function public.bot_payment_chime_emit(p_key text, p_transaction_id uuid, p_bank text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  perform public.require_bot(p_key);
  select tx.id, tx.workspace_id, tx.amount, tx.currency, tx.bank_ref
    into t
    from public.transactions tx
    join public.workspaces w on w.id = tx.workspace_id
   where tx.id = p_transaction_id
     and tx.type = 'INCOME' and tx.debt_id is null and w.type = 'BUSINESS';
  if t.id is null then
    return jsonb_build_object('status', 'skipped', 'why', 'not_business_income');
  end if;
  -- Never twice: this transaction (a KHQR sale already announced, or a chime already rung) …
  if exists (select 1 from public.soundbox_events e where e.transaction_id = t.id)
     or exists (select 1 from public.payment_chimes c where c.transaction_id = t.id) then
    return jsonb_build_object('status', 'skipped', 'why', 'already_rung');
  end if;
  -- … nor the same payment under another transaction (its bank reference already rang).
  if t.bank_ref is not null and (
       exists (select 1 from public.soundbox_events e join public.transactions o on o.id = e.transaction_id
                where o.workspace_id = t.workspace_id and o.bank_ref = t.bank_ref)
    or exists (select 1 from public.payment_chimes c join public.transactions o on o.id = c.transaction_id
                where o.workspace_id = t.workspace_id and o.bank_ref = t.bank_ref)) then
    return jsonb_build_object('status', 'skipped', 'why', 'same_bank_ref');
  end if;
  insert into public.payment_chimes (workspace_id, transaction_id, amount, currency, bank)
  values (t.workspace_id, t.id, t.amount, t.currency, nullif(left(btrim(coalesce(p_bank, '')), 60), ''))
  on conflict (transaction_id) do nothing;
  delete from public.payment_chimes where created_at < now() - interval '3 days';
  return jsonb_build_object('status', 'ok', 'workspace_id', t.workspace_id);
end;
$$;
revoke all on function public.bot_payment_chime_emit(text, uuid, text) from public;
grant execute on function public.bot_payment_chime_emit(text, uuid, text) to anon, authenticated;
