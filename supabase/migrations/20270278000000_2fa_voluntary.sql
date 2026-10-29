-- 2FA is the member's own choice (founder, 29/10/2026: «turning on 2FA is the user's choice, if they want their account
-- safe — even Facebook, Telegram and Cloudflare never force it like our app»). Found with the demo account: a former
-- staff member, now a plain FREE user, could open the app but save nothing until they set up 2FA.
--  1. Giving a staff role no longer locks the whole account (admin_staff_set). The admin console keeps asking for a 2FA
--     session on its own — that protects the members' data, not the staff member's account.
--  2. An admin can no longer put the account-wide requirement on anyone (admin_set_require_2fa refuses p_on = true);
--     lifting an old one still works.
--  3. Every account-wide requirement in place is lifted now, each one audited.

-- 1.
do $$
declare
  def text := pg_get_functiondef('public.admin_staff_set(text,text,text)'::regprocedure);
  pattern constant text := 'if p_role <> ''content_admin'' then\s*insert into public\.account_controls \(user_id, require_2fa\)[^;]*;\s*end if;';
begin
  if def ~ 'account_controls' then
    if def !~ pattern then
      raise exception '2fa voluntary: admin_staff_set does not match';
    end if;
    def := regexp_replace(def, pattern, '-- 2FA is the member''s own choice (29/10/2026): a role no longer locks the account.');
    execute def;
  end if;
end $$;

-- 2.
create or replace function public.admin_set_require_2fa(p_user_id uuid, p_on boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check_target(p_user_id, p_note);
  if p_on then
    return jsonb_build_object('ok', false, 'reason', 'voluntary');
  end if;
  update public.account_controls set require_2fa = false, updated_at = now() where user_id = p_user_id and require_2fa;
  perform public.audit('FORCE_2FA_OFF', p_user_id, p_note, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_require_2fa(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_require_2fa(uuid, boolean, text) to authenticated;

-- 3.
do $$
declare
  founder constant uuid := '2e110364-2289-4544-a8f5-023549e5adc4';
  member uuid;
begin
  for member in select c.user_id from public.account_controls c where c.require_2fa loop
    update public.account_controls set require_2fa = false, updated_at = now() where user_id = member;
    perform public.audit('FORCE_2FA_OFF', member, '2FA is the member''s own choice — account-wide requirement lifted on the founder''s decision (29/10/2026)', null, founder);
  end loop;
end $$;
