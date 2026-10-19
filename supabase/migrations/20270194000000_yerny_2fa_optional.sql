-- Yerny's access at once (founder's decision, 19/10/2026): «2FA required» locked her whole account (account_ok) until
-- she set up 2FA. The account-wide requirement is lifted for her, so she uses the app and manages content (places,
-- qasidah, du'as, Adhans — her admin role is enough) right away. The admin console still asks for 2FA on its own
-- (its functions need a 2FA session); her profile card leads her to turn it on. Audited.
do $$
declare
  member constant uuid := 'b6866ff8-3da6-41fa-8119-18a103ca7cf5';
  founder constant uuid := '2e110364-2289-4544-a8f5-023549e5adc4';
begin
  update public.account_controls set require_2fa = false, updated_at = now() where user_id = member and require_2fa;
  if found then
    perform public.audit('STAFF_2FA_OPTIONAL', member, 'Yerny — account-wide 2FA requirement lifted on the founder''s decision; the admin console still needs 2FA', null, founder);
  end if;
end $$;
