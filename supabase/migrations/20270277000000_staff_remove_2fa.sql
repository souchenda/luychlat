-- Removing a staff member lifts the 2FA lock their role put on (founder, 29/10/2026: «why require 2FA on a plain FREE
-- account?»). admin_staff_set turns require_2fa on for support / admin / super_admin (the console is protected);
-- admin_staff_remove made them a normal user again but left the lock, so the former staff account (the demo account)
-- could open the app yet save nothing. A super admin can still require 2FA of anyone by hand afterwards
-- (admin_set_require_2fa). Rebuilt from the live definition; the step is audited with the removal.
do $$
declare
  def text := pg_get_functiondef('public.admin_staff_remove(uuid, text)'::regprocedure);
  anchor constant text := '  delete from public.admin_plan_overrides where user_id = p_user_id;';
begin
  if position('account_controls' in def) = 0 then
    if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
      raise exception 'staff remove 2fa: admin_staff_remove does not match';
    end if;
    def := replace(def, anchor, anchor || '
  -- The role''s 2FA lock goes with the role (a normal account is never locked by a role it no longer has).
  update public.account_controls set require_2fa = false, updated_at = now() where user_id = p_user_id and require_2fa;');
    execute def;
  end if;
end $$;
