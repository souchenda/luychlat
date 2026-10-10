-- SoundBox: a customer's KHQR payment recorded by /api/khqr/ingest is announced live on the cashier
-- screen (/soundbox). The server emits one row per payment into soundbox_events; members of the
-- workspace receive it through Supabase Realtime (postgres_changes, RLS-filtered), so no key or
-- channel secret ever reaches the browser.
--
-- Strict guard (bot_soundbox_emit): only a customer payment — INCOME, with a bank reference, in the
-- Sales category. Never an own-account transfer (owner contribution / TRANSFER), an adjustment or
-- an expense.

create table if not exists public.soundbox_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  transaction_id   uuid not null unique references public.transactions (id) on delete cascade,
  amount           numeric(18, 2) not null check (amount > 0),
  currency         public.currency_code not null,
  account_name     text not null,
  payer            text,
  transaction_time timestamptz not null,
  created_at       timestamptz not null default now()
);
create index if not exists soundbox_events_ws_idx on public.soundbox_events (workspace_id, transaction_time desc);
alter table public.soundbox_events enable row level security;
revoke all on public.soundbox_events from anon, authenticated;
grant select on public.soundbox_events to authenticated;
drop policy if exists soundbox_events_member on public.soundbox_events;
create policy soundbox_events_member on public.soundbox_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'soundbox_events') then
    alter publication supabase_realtime add table public.soundbox_events;
  end if;
end $$;

create or replace function public.bot_soundbox_emit(p_key text, p_transaction_id uuid, p_payer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  perform public.require_bot(p_key);
  select tx.id, tx.workspace_id, tx.amount, tx.currency, tx.transaction_date, w.name as wallet
  into t
  from public.transactions tx
  join public.wallets_accounts w on w.id = tx.wallet_id
  join public.categories c on c.id = tx.category_id
  where tx.id = p_transaction_id
    and tx.type = 'INCOME' and tx.bank_ref is not null and tx.debt_id is null
    and c.preset_key = 'sales';
  if t.id is null then
    return jsonb_build_object('status', 'skipped');
  end if;
  insert into public.soundbox_events (workspace_id, transaction_id, amount, currency, account_name, payer, transaction_time)
  values (t.workspace_id, t.id, t.amount, t.currency, t.wallet, nullif(left(btrim(coalesce(p_payer, '')), 80), ''), t.transaction_date)
  on conflict (transaction_id) do nothing;
  -- Kept for today's list only.
  delete from public.soundbox_events where created_at < now() - interval '3 days';
  return jsonb_build_object('status', 'ok', 'workspace_id', t.workspace_id);
end;
$$;
revoke all on function public.bot_soundbox_emit(text, uuid, text) from public;
grant execute on function public.bot_soundbox_emit(text, uuid, text) to anon, authenticated;

select public.apply_security_gate();
