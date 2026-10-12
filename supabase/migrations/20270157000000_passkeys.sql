-- Passkeys (W3C WebAuthn): sign in with Face ID / Touch ID / fingerprint / Windows Hello instead of
-- the password (founder, 12/10/2026). The server verifies every ceremony (@simplewebauthn/server) and
-- is the only writer — through the service-role key; people may list and remove their own.
-- Challenges are single-use and live five minutes.

create table if not exists public.passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique check (credential_id ~ '^[A-Za-z0-9_-]{16,1400}$'),
  public_key    text not null check (public_key ~ '^[A-Za-z0-9_-]+$'),
  counter       bigint not null default 0 check (counter >= 0),
  transports    text[],
  device_label  text check (device_label is null or char_length(device_label) <= 60),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists passkeys_user_idx on public.passkeys (user_id);
alter table public.passkeys enable row level security;
revoke all on public.passkeys from anon, authenticated;
grant select, delete on public.passkeys to authenticated;
drop policy if exists passkeys_select_own on public.passkeys;
create policy passkeys_select_own on public.passkeys for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists passkeys_delete_own on public.passkeys;
create policy passkeys_delete_own on public.passkeys for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.passkey_challenges (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('register', 'login')),
  challenge   text not null,
  user_id     uuid references auth.users (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '5 minutes'
);
alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_challenges from anon, authenticated;

select public.apply_security_gate();
