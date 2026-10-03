-- The founder account is protected: no one (including other super admins)
-- can remove it from staff, demote it, or suspend it. The owner is the first
-- super admin (marked once here; no e-mail address is written into code).

alter table public.app_admins add column if not exists is_owner boolean not null default false;
create unique index if not exists app_admins_one_owner on public.app_admins (is_owner) where is_owner;

update public.app_admins set is_owner = true
where user_id = (select a.user_id from public.app_admins a where a.role = 'super_admin' order by a.created_at, a.user_id limit 1)
  and not exists (select 1 from public.app_admins o where o.is_owner);

-- The owner always stays super_admin.
create or replace function public.app_admins_guard_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'the owner cannot be removed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and (new.role <> 'super_admin' or not new.is_owner) then
    raise exception 'the owner stays super_admin' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists app_admins_guard_owner on public.app_admins;
create trigger app_admins_guard_owner before update or delete on public.app_admins
  for each row execute function public.app_admins_guard_owner();

drop function if exists public.admin_staff_list();
create or replace function public.admin_staff_list()
returns table (user_id uuid, email text, display_name text, role text, is_owner boolean, added_at timestamptz, mfa_enabled boolean, last_active_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select a.user_id, u.email::text, pr.display_name, a.role, a.is_owner, a.created_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'),
         public.last_active_at(a.user_id)
  from public.app_admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles pr on pr.id = a.user_id
  order by a.is_owner desc, case a.role when 'super_admin' then 0 when 'admin' then 1 else 2 end, a.created_at;
end;
$$;
revoke all on function public.admin_staff_list() from public, anon;
grant execute on function public.admin_staff_list() to authenticated;

-- Friendly refusals before the trigger would raise.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.admin_staff_set(text, text, text)'::regprocedure);
  if position('''owner''' in def) = 0 then
    def := replace(def, '  select a.role into v_old from public.app_admins a where a.user_id = v_user;',
      '  select a.role into v_old from public.app_admins a where a.user_id = v_user;
  if exists (select 1 from public.app_admins a where a.user_id = v_user and a.is_owner) then
    return jsonb_build_object(''ok'', false, ''reason'', ''owner'');
  end if;');
    if position('''owner''' in def) = 0 then
      raise exception 'admin_staff_set: role lookup not found';
    end if;
    execute def;
  end if;

  def := pg_get_functiondef('public.admin_staff_remove(uuid, text)'::regprocedure);
  if position('''owner''' in def) = 0 then
    def := replace(def, '  select a.role into v_old from public.app_admins a where a.user_id = p_user_id;',
      '  select a.role into v_old from public.app_admins a where a.user_id = p_user_id;
  if exists (select 1 from public.app_admins a where a.user_id = p_user_id and a.is_owner) then
    return jsonb_build_object(''ok'', false, ''reason'', ''owner'');
  end if;');
    if position('''owner''' in def) = 0 then
      raise exception 'admin_staff_remove: role lookup not found';
    end if;
    execute def;
  end if;
end $$;
