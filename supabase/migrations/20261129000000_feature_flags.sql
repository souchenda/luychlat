-- Feature flags: a feature still in testing is ADMIN_ONLY — only staff and 🧪
-- test accounts (public.is_internal_user) see it in the menu, can open its
-- pages and use its bot commands. PUBLIC is everyone, DISABLED no one. Super
-- admins flip them in /admin/super (audited). This hides features from the
-- app and the bot; the data itself stays protected by RLS as before.

create table if not exists public.feature_flags (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  status     text not null default 'ADMIN_ONLY' check (status in ('PUBLIC', 'ADMIN_ONLY', 'DISABLED')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.feature_flags (key, status) values
  ('invoices', 'ADMIN_ONLY'),
  ('gifts', 'ADMIN_ONLY'),
  ('pools', 'ADMIN_ONLY'),
  ('statement_import', 'ADMIN_ONLY')
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
revoke insert, update, delete on public.feature_flags from anon, authenticated;
drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select to authenticated using (true);

-- May this user use the feature? (unknown keys are public)
create or replace function public.feature_allowed_for(p_key text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select f.status from public.feature_flags f where f.key = p_key), 'PUBLIC')
    when 'PUBLIC' then true
    when 'DISABLED' then false
    else p_user_id is not null and public.is_internal_user(p_user_id)
  end
$$;
revoke all on function public.feature_allowed_for(text, uuid) from public, anon, authenticated;

-- Every flag for the signed-in user: { "invoices": true, … }.
create or replace function public.my_features()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f.key, public.feature_allowed_for(f.key, (select auth.uid()))), '{}'::jsonb)
  from public.feature_flags f
$$;
revoke all on function public.my_features() from public, anon;
grant execute on function public.my_features() to authenticated;

-- The same for the account linked to a bot chat.
create or replace function public.bot_features(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  return coalesce((select jsonb_object_agg(f.key, public.feature_allowed_for(f.key, link.uid)) from public.feature_flags f), '{}'::jsonb);
end;
$$;
revoke all on function public.bot_features(text, bigint) from public;
grant execute on function public.bot_features(text, bigint) to anon, authenticated;

-- Super admin: the flags with who changed them last.
create or replace function public.admin_feature_flags()
returns table (key text, status text, updated_at timestamptz, updated_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
    select f.key, f.status, f.updated_at, p.display_name
    from public.feature_flags f
    left join public.profiles p on p.id = f.updated_by
    order by f.key;
end;
$$;
revoke all on function public.admin_feature_flags() from public, anon;
grant execute on function public.admin_feature_flags() to authenticated;

create or replace function public.admin_set_feature_flag(p_key text, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status text;
begin
  perform public.require_super_admin();
  if p_status not in ('PUBLIC', 'ADMIN_ONLY', 'DISABLED') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'note required' using errcode = '22023';
  end if;
  select status into old_status from public.feature_flags where key = p_key for update;
  if not found then
    raise exception 'unknown feature' using errcode = 'P0002';
  end if;
  if old_status = p_status then
    return;
  end if;
  update public.feature_flags set status = p_status, updated_at = now(), updated_by = (select auth.uid()) where key = p_key;
  perform public.audit('FEATURE_FLAG_SET', null, trim(p_note), p_key || ': ' || old_status || ' → ' || p_status);
end;
$$;
revoke all on function public.admin_set_feature_flag(text, text, text) from public, anon;
grant execute on function public.admin_set_feature_flag(text, text, text) to authenticated;

-- Public pool pages (/p/…) only while pools are open to the pool's keeper.
create or replace function public.pool_public(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
  owner uuid;
begin
  if p_slug !~ '^[a-f0-9]{32}$' then
    return null;
  end if;
  select id, created_by into pid, owner from public.pools where share_slug = p_slug;
  if pid is null or not public.feature_allowed_for('pools', owner) then
    return null;
  end if;
  -- No internal ids on the public page.
  return (select s - 'id' - 'wallet_id' - 'workspace_id'
            || jsonb_build_object('members', coalesce((select jsonb_agg(m - 'id') from jsonb_array_elements(s -> 'members') m), '[]'::jsonb),
                                  'entries', coalesce((select jsonb_agg(e - 'id') from jsonb_array_elements(s -> 'entries') e), '[]'::jsonb))
          from public.pool_snapshot(pid, 'public') s);
end;
$$;

select public.apply_security_gate();
