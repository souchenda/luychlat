-- The incident kit (founder, 28/10/2026 — «I don't want to answer customers while the app has a problem; everything
-- prepared beforehand, solved at once»): ONE notice shown to everyone in the app, chosen from wording written and
-- approved in advance (lib/incident-notices.ts) — never free text typed in a hurry.
--   • automatic: the health watchdog sets it when the database or the bot has been down 5 minutes (the moment the founder
--     is paged) and clears it when they recover — an automatic notice never replaces one the founder set;
--   • by hand: Super Admin › Control Center, one tap per prepared notice (super admin + 2FA on the session, audited).
create table if not exists public.app_notice (
  id smallint primary key default 1 check (id = 1),
  kind text check (kind in ('app_slow', 'bot_slow', 'bank_alerts_slow', 'maintenance')),
  -- Planned maintenance only: announced before it starts, shown until it ends.
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  set_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.app_notice (id) values (1) on conflict (id) do nothing;

alter table public.app_notice enable row level security;
-- Everyone may read it (also the sign-in page): it holds no personal data. Writes only through the functions below.
drop policy if exists app_notice_read on public.app_notice;
create policy app_notice_read on public.app_notice for select to anon, authenticated using (true);
grant select on public.app_notice to anon, authenticated;

-- The founder's tap. p_kind null = «resolved» (the notice goes away).
create or replace function public.ops_set_notice(p_kind text, p_starts_at timestamptz default null, p_ends_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('app_slow', 'bot_slow', 'bank_alerts_slow', 'maintenance') then
    raise exception 'unknown notice' using errcode = '22023';
  end if;
  if p_kind = 'maintenance' and (p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at) then
    raise exception 'maintenance needs a start and an end' using errcode = '22023';
  end if;
  update public.app_notice
     set kind = p_kind,
         starts_at = case when p_kind = 'maintenance' then p_starts_at end,
         ends_at = case when p_kind = 'maintenance' then p_ends_at end,
         source = 'manual',
         set_by = (select auth.uid()),
         updated_at = now()
   where id = 1;
  perform public.audit('OPS_NOTICE', null, null, coalesce(p_kind, 'resolved'));
end;
$$;
revoke all on function public.ops_set_notice(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.ops_set_notice(text, timestamptz, timestamptz) to authenticated;

-- The watchdog (bot key): on → shows its notice unless one is already shown; off → clears only its own automatic one.
create or replace function public.bot_notice_auto(p_key text, p_kind text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_kind not in ('app_slow', 'bot_slow') then
    raise exception 'unknown notice' using errcode = '22023';
  end if;
  if p_on then
    update public.app_notice
       set kind = p_kind, starts_at = null, ends_at = null, source = 'auto', set_by = null, updated_at = now()
     where id = 1 and kind is null;
  else
    update public.app_notice
       set kind = null, source = 'auto', updated_at = now()
     where id = 1 and source = 'auto' and kind = p_kind;
  end if;
end;
$$;
revoke all on function public.bot_notice_auto(text, text, boolean) from public;
grant execute on function public.bot_notice_auto(text, text, boolean) to anon, authenticated;
