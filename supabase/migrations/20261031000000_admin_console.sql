-- Admin console: account controls (suspend, require 2FA, business verified),
-- a richer user directory, and an append-only, hash-chained audit log of
-- every admin action.
--
-- Privacy: nothing here gives admins wallet, debt or transaction data — the
-- directory shows account and subscription metadata and counts only.

-- ---------------------------------------------------------------------------
-- Account controls
-- ---------------------------------------------------------------------------
create table if not exists public.account_controls (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  suspended_at         timestamptz,
  suspended_reason     text check (suspended_reason is null or char_length(suspended_reason) <= 300),
  require_2fa          boolean not null default false,
  business_verified_at timestamptz,
  business_note        text check (business_note is null or char_length(business_note) <= 300),
  updated_at           timestamptz not null default now()
);
alter table public.account_controls enable row level security;
revoke all on public.account_controls from anon, authenticated;

-- The caller's account is usable: not suspended, and 2FA passed when an admin requires it.
create or replace function public.account_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.account_controls c
    where c.user_id = (select auth.uid())
      and (c.suspended_at is not null or (c.require_2fa and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'))
  );
$$;
revoke all on function public.account_ok() from public, anon;
grant execute on function public.account_ok() to authenticated;

-- Every table's security gate and every workspace check go through access_ok.
create or replace function public.access_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_alive() and public.mfa_ok() and public.account_ok();
$$;

-- For the app's own screens ("account suspended", "set up 2FA"): readable even when access_ok is false.
create or replace function public.my_account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'suspended', coalesce(c.suspended_at is not null, false),
    'suspended_reason', c.suspended_reason,
    'require_2fa', coalesce(c.require_2fa, false)
  )
  from (select 1) one
  left join public.account_controls c on c.user_id = (select auth.uid());
$$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: append-only, each row chained to the previous one by SHA-256
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  seq          bigint not null unique,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  session_id   uuid,
  action       text not null check (action ~ '^[A-Z0-9_]{3,40}$'),
  target_id    uuid,
  target_email text,
  note         text check (note is null or char_length(note) <= 500),
  ref          text check (ref is null or char_length(ref) <= 120),
  prev_hash    text not null,
  hash         text not null
);
-- No foreign keys on purpose: deleting a user must not touch (and so cannot be blocked by) the log.
create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_id, at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

create or replace function public.audit_row_hash(r public.admin_audit_log)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws('|',
    r.prev_hash, r.seq, to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    r.actor_id, r.actor_email, r.session_id, r.action, r.target_id, r.target_email, r.note, r.ref
  ), 'UTF8')), 'hex');
$$;

create or replace function public.admin_audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last public.admin_audit_log;
begin
  -- One writer at a time, so seq and prev_hash follow commit order.
  perform pg_advisory_xact_lock(hashtext('admin_audit_log'));
  select * into last from public.admin_audit_log order by seq desc limit 1;
  new.at := now();
  new.seq := coalesce(last.seq, 0) + 1;
  new.prev_hash := coalesce(last.hash, repeat('0', 64));
  new.hash := public.audit_row_hash(new);
  return new;
end;
$$;
drop trigger if exists admin_audit_log_chain on public.admin_audit_log;
create trigger admin_audit_log_chain before insert on public.admin_audit_log
  for each row execute function public.admin_audit_log_chain();

create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists admin_audit_log_no_change on public.admin_audit_log;
create trigger admin_audit_log_no_change before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();
drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_log_immutable();

-- Write one entry. The actor is the signed-in admin unless given (Telegram /setgold).
create or replace function public.audit(p_action text, p_target uuid default null, p_note text default null, p_ref text default null, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, (select auth.uid()));
  v_session uuid;
begin
  begin
    v_session := case when p_actor is null then nullif(auth.jwt() ->> 'session_id', '')::uuid end;
  exception when others then
    v_session := null;
  end;
  insert into public.admin_audit_log (actor_id, actor_email, session_id, action, target_id, target_email, note, ref, seq, prev_hash, hash)
  values (
    v_actor, (select u.email::text from auth.users u where u.id = v_actor), v_session, p_action,
    p_target, (select u.email::text from auth.users u where u.id = p_target),
    left(nullif(btrim(coalesce(p_note, '')), ''), 500), left(p_ref, 120), 0, '', ''
  );
end;
$$;
revoke all on function public.audit(text, uuid, text, text, uuid) from public, anon, authenticated;

-- Existing admin actions, recorded where their changes land -----------------

-- Plan changes by an admin (extend, set end, cancel, approve / reject a payment).
create or replace function public.audit_subscription_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor is not null and new.actor <> new.user_id and exists (select 1 from public.app_admins a where a.user_id = new.actor) then
    perform public.audit(
      case new.kind
        when 'EXTENDED' then 'EXPIRY_EXTENDED'
        when 'SET_END' then 'EXPIRY_SET'
        when 'CANCELLED' then 'PLAN_CANCELLED'
        when 'REJECTED' then 'PAYMENT_REJECTED'
        else left('PLAN_' || upper(regexp_replace(new.kind, '[^A-Za-z0-9]+', '_', 'g')), 40)
      end,
      new.user_id,
      concat_ws(' · ', new.plan_code, case when new.period_end is not null then 'until ' || to_char(new.period_end at time zone 'Asia/Phnom_Penh', 'YYYY-MM-DD') end, new.note),
      coalesce(new.payment_id::text, 'subscription_event:' || new.id),
      new.actor
    );
  end if;
  return new;
end;
$$;
drop trigger if exists audit_subscription_events on public.subscription_events;
create trigger audit_subscription_events after insert on public.subscription_events
  for each row execute function public.audit_subscription_events();

-- 2FA reset for a user.
create or replace function public.audit_security_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'MFA_RESET' and new.actor is not null then
    perform public.audit('MFA_RESET', new.user_id, new.note, 'security_event:' || new.id, new.actor);
  end if;
  return new;
end;
$$;
drop trigger if exists audit_security_events on public.security_events;
create trigger audit_security_events after insert on public.security_events
  for each row execute function public.audit_security_events();

-- Settings saved from /admin (payment instructions, support contacts, about, gold rates…).
-- The bot's own writes (live market data) have no signed-in admin and aren't logged.
create or replace function public.audit_app_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and public.is_admin() then
    perform public.audit('SETTINGS_UPDATED', null, new.key, 'app_settings:' || new.key);
  end if;
  return new;
end;
$$;
drop trigger if exists audit_app_settings on public.app_settings;
create trigger audit_app_settings after insert or update on public.app_settings
  for each row execute function public.audit_app_settings();

-- Admin test plan on their own account.
create or replace function public.audit_plan_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.audit('TEST_PLAN_ENDED', old.user_id, null, null);
    return old;
  end if;
  perform public.audit('TEST_PLAN_SET', new.user_id, new.plan_code || ' until ' || to_char(new.expires_at at time zone 'Asia/Phnom_Penh', 'YYYY-MM-DD HH24:MI'), null);
  return new;
end;
$$;
drop trigger if exists audit_plan_overrides on public.admin_plan_overrides;
create trigger audit_plan_overrides after insert or update or delete on public.admin_plan_overrides
  for each row execute function public.audit_plan_overrides();

-- Bot (re)activation.
create or replace function public.audit_bot_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and public.is_admin() then
    perform public.audit('BOT_ACTIVATED', null, '@' || coalesce(new.username, '?'), null);
  end if;
  return new;
end;
$$;
drop trigger if exists audit_bot_config on public.bot_config;
create trigger audit_bot_config after insert or update on public.bot_config
  for each row execute function public.audit_bot_config();

-- Support ticket status / replies.
create or replace function public.audit_support_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> new.user_id and public.is_admin()
     and (new.status is distinct from old.status or new.admin_reply is distinct from old.admin_reply) then
    perform public.audit('TICKET_UPDATED', new.user_id, new.status, 'ticket:' || new.id);
  end if;
  return new;
end;
$$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'admin_reply') then
    drop trigger if exists audit_support_tickets on public.support_tickets;
    create trigger audit_support_tickets after update on public.support_tickets
      for each row execute function public.audit_support_tickets();
  else
    raise warning 'support_tickets.admin_reply not found: ticket updates are not audited';
  end if;
end $$;

-- Gold prices set from /admin (server route, as the admin) ------------------
create or replace function public.admin_log_action(p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_action not in ('SET_GOLD_OVERRIDE', 'CLEAR_GOLD_OVERRIDE') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  perform public.audit(p_action, null, p_note, null);
end;
$$;
revoke all on function public.admin_log_action(text, text) from public, anon;
grant execute on function public.admin_log_action(text, text) to authenticated;

-- …and from Telegram /setgold, by an admin's linked chat.
create or replace function public.bot_admin_audit(p_key text, p_chat_id bigint, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  perform public.require_bot(p_key);
  if p_action not in ('SET_GOLD_OVERRIDE', 'CLEAR_GOLD_OVERRIDE') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  select l.user_id into v_admin from public.telegram_links l join public.app_admins a on a.user_id = l.user_id where l.chat_id = p_chat_id limit 1;
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  perform public.audit(p_action, null, concat_ws(' · ', p_note, 'via Telegram'), null, v_admin);
end;
$$;
revoke all on function public.bot_admin_audit(text, bigint, text, text) from public;
grant execute on function public.bot_admin_audit(text, bigint, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- New admin actions
-- ---------------------------------------------------------------------------
create or replace function public.admin_check_target(p_user_id uuid, p_note text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user not found' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_check_target(uuid, text) from public, anon, authenticated;

-- Suspend: no data access (access_ok), signed out everywhere, Telegram unlinked. Reactivate undoes the block.
create or replace function public.admin_set_account_status(p_user_id uuid, p_suspend boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check_target(p_user_id, p_note);
  if p_suspend then
    if p_user_id = (select auth.uid()) or exists (select 1 from public.app_admins a where a.user_id = p_user_id) then
      raise exception 'admins cannot be suspended' using errcode = '42501';
    end if;
    insert into public.account_controls (user_id, suspended_at, suspended_reason)
    values (p_user_id, now(), left(btrim(p_note), 300))
    on conflict (user_id) do update set suspended_at = now(), suspended_reason = excluded.suspended_reason, updated_at = now();
    delete from auth.sessions where user_id = p_user_id;
    delete from public.telegram_links where user_id = p_user_id;
    perform public.audit('ACCOUNT_SUSPENDED', p_user_id, p_note, null);
  else
    update public.account_controls set suspended_at = null, suspended_reason = null, updated_at = now() where user_id = p_user_id;
    perform public.audit('ACCOUNT_REACTIVATED', p_user_id, p_note, null);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_account_status(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;

-- Require 2FA: until the user sets it up and passes it, the app shows only the 2FA setup.
create or replace function public.admin_set_require_2fa(p_user_id uuid, p_on boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check_target(p_user_id, p_note);
  insert into public.account_controls (user_id, require_2fa) values (p_user_id, p_on)
  on conflict (user_id) do update set require_2fa = excluded.require_2fa, updated_at = now();
  perform public.audit(case when p_on then 'FORCE_2FA_ON' else 'FORCE_2FA_OFF' end, p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_require_2fa(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_require_2fa(uuid, boolean, text) to authenticated;

-- Business verified: set by an admin after checking documents (the note says what was checked).
create or replace function public.admin_set_business_verified(p_user_id uuid, p_on boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check_target(p_user_id, p_note);
  insert into public.account_controls (user_id, business_verified_at, business_note)
  values (p_user_id, case when p_on then now() end, case when p_on then left(btrim(p_note), 300) end)
  on conflict (user_id) do update set
    business_verified_at = excluded.business_verified_at, business_note = excluded.business_note, updated_at = now();
  perform public.audit(case when p_on then 'BUSINESS_VERIFIED' else 'BUSINESS_UNVERIFIED' end, p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_business_verified(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_business_verified(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Directory and log for /admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text, p_filter text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, display_name text, joined_at timestamptz, last_active_at timestamptz,
  plan_code text, tier text, status text, period_end timestamptz, pending_payments integer,
  workspace_count integer, telegram_linked boolean, phone_verified boolean, mfa_enabled boolean,
  suspended boolean, suspended_reason text, require_2fa boolean, business_verified boolean, business_note text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  with rows as (
    select
      u.id as user_id, u.email::text as email, pr.display_name, u.created_at as joined_at, public.last_active_at(u.id) as last_active_at,
      s.plan_code,
      case when s.status = 'ACTIVE' and s.current_period_end > now() then (case when s.plan_code like 'ULTRA%' then 'ULTRA' else 'PRO' end) else 'FREE' end as tier,
      s.status, s.current_period_end as period_end,
      (select count(*)::integer from public.payments p where p.user_id = u.id and p.status = 'PENDING') as pending_payments,
      (select count(*)::integer from public.workspace_members m where m.user_id = u.id) as workspace_count,
      exists (select 1 from public.telegram_links l where l.user_id = u.id) as telegram_linked,
      u.phone_confirmed_at is not null as phone_verified,
      exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as mfa_enabled,
      c.suspended_at is not null as suspended, c.suspended_reason,
      coalesce(c.require_2fa, false) as require_2fa,
      c.business_verified_at is not null as business_verified, c.business_note
    from auth.users u
    left join public.subscriptions s on s.user_id = u.id
    left join public.profiles pr on pr.id = u.id
    left join public.account_controls c on c.user_id = u.id
    where coalesce(p_search, '') = ''
      or u.email ilike '%' || p_search || '%'
      or pr.display_name ilike '%' || p_search || '%'
      or u.id::text = p_search
  ), filtered as (
    select * from rows r
    where case coalesce(p_filter, 'all')
      when 'pro' then r.tier <> 'FREE'
      when 'free' then r.tier = 'FREE'
      when 'expiring' then r.tier <> 'FREE' and r.period_end <= now() + interval '7 days'
      when 'expired' then r.tier = 'FREE' and r.period_end is not null
      when 'pending' then r.pending_payments > 0
      when 'suspended' then r.suspended
      else true
    end
  )
  select f.*, count(*) over () as total from filtered f
  order by f.pending_payments desc, f.suspended desc, f.period_end asc nulls last, f.joined_at desc
  limit least(coalesce(p_limit, 50), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;

create or replace function public.admin_audit_list(p_limit integer default 50, p_offset integer default 0, p_target uuid default null)
returns setof public.admin_audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select * from public.admin_audit_log l
  where p_target is null or l.target_id = p_target
  order by l.seq desc
  limit least(coalesce(p_limit, 50), 10000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_audit_list(integer, integer, uuid) from public, anon;
grant execute on function public.admin_audit_list(integer, integer, uuid) to authenticated;

-- Recomputes the whole chain: ok, number of entries, and the first entry that doesn't match.
create or replace function public.admin_audit_verify()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.admin_audit_log;
  prev text := repeat('0', 64);
  expected bigint := 1;
  n bigint := 0;
begin
  perform public.require_admin();
  for r in select * from public.admin_audit_log order by seq loop
    if r.seq <> expected or r.prev_hash <> prev or r.hash <> public.audit_row_hash(r) then
      return jsonb_build_object('ok', false, 'entries', n, 'broken_at', r.seq);
    end if;
    prev := r.hash;
    expected := expected + 1;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'entries', n, 'last_hash', case when n > 0 then prev end);
end;
$$;
revoke all on function public.admin_audit_verify() from public, anon;
grant execute on function public.admin_audit_verify() to authenticated;

select public.apply_security_gate();
