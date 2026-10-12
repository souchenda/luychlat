-- CBC K-Score (founder, 12/10/2026): read from a CBC mobile-app screenshot, confirmed by the person,
-- and kept for that person ONLY — not in any workspace, never shown by the bot or in a group.

create table if not exists public.credit_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source      text not null default 'CBC_KSCORE' check (source = 'CBC_KSCORE'),
  score       integer not null check (score between 100 and 1400),
  risk_label  text check (risk_label is null or char_length(risk_label) <= 40),
  score_date  date not null,
  history     jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  factors     jsonb not null default '[]'::jsonb check (jsonb_typeof(factors) = 'array'),
  created_at  timestamptz not null default now(),
  unique (user_id, source, score_date)
);
create index if not exists credit_scores_user_idx on public.credit_scores (user_id, score_date desc);

alter table public.credit_scores enable row level security;
drop policy if exists credit_scores_own on public.credit_scores;
create policy credit_scores_own on public.credit_scores
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.credit_scores to authenticated;

select public.apply_security_gate();
