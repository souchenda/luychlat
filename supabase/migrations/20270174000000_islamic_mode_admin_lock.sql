-- Islamic Mode is managed by an admin (founder, 18/10/2026). A regular user can no longer turn it on or off;
-- what they have now stays (no one is switched). An admin (role admin / super_admin) turns it on or off for any
-- user from the admin console (admin_set_islamic_mode, audited) and for themselves in Settings.
--
-- Enforced here, not only in the app: whatever the request (set_islamic_tools, a direct upsert on
-- islamic_settings), `enabled` cannot change unless the caller is an admin. The rest of the user's own Zakat
-- settings (nisab basis, gold grams, hawl…) stay theirs to edit.

create or replace function public.islamic_mode_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A request from a signed-in person who is not an admin may not change the mode. (No auth.uid(): a
  -- migration or a server job — allowed.)
  if (select auth.uid()) is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.enabled then
      raise exception 'islamic mode is managed by an admin' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.enabled is distinct from old.enabled then
      raise exception 'islamic mode is managed by an admin' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.islamic_mode_guard() from public, anon, authenticated;

drop trigger if exists islamic_mode_guard on public.islamic_settings;
create trigger islamic_mode_guard before insert or update on public.islamic_settings
  for each row execute function public.islamic_mode_guard();

-- The admin's switch for one user: on also adds the Zakat / Sadaqah / Waqf / Riba categories to the
-- workspaces that user owns (as set_islamic_tools does). A note is required and kept in the audit log.
create or replace function public.admin_set_islamic_mode(p_user_id uuid, p_on boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws record;
begin
  perform public.admin_check_target(p_user_id, p_note);
  insert into public.islamic_settings (user_id, enabled, updated_at)
  values (p_user_id, coalesce(p_on, false), now())
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now();
  if coalesce(p_on, false) then
    for ws in select id from public.workspaces where user_id = p_user_id loop
      perform public.ensure_preset_category(ws.id, 'zakat', 'EXPENSE', 'hand-heart', '#059669', 'ហ្សាកាត់');
      perform public.ensure_preset_category(ws.id, 'sadaqah', 'EXPENSE', 'hand-heart', '#0d9488', 'ទាន សាដាកះ');
      perform public.ensure_preset_category(ws.id, 'waqf', 'EXPENSE', 'landmark', '#0891b2', 'វ៉ាក់ហ្វ');
      perform public.ensure_preset_category(ws.id, 'riba_purification', 'EXPENSE', 'scale', '#64748b', 'សម្អាតការប្រាក់');
      perform public.ensure_preset_category(ws.id, 'bank_interest', 'INCOME', 'landmark', '#64748b', 'ការប្រាក់ធនាគារ');
    end loop;
  end if;
  perform public.audit(case when coalesce(p_on, false) then 'ISLAMIC_MODE_ON' else 'ISLAMIC_MODE_OFF' end, p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_islamic_mode(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_islamic_mode(uuid, boolean, text) to authenticated;

-- Whether a user has Islamic Mode on — for the admin console only (it is religious information: never in
-- the general user directory).
create or replace function public.admin_islamic_mode(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return coalesce((select s.enabled from public.islamic_settings s where s.user_id = p_user_id), false);
end;
$$;
revoke all on function public.admin_islamic_mode(uuid) from public, anon;
grant execute on function public.admin_islamic_mode(uuid) to authenticated;
