-- Yerny — the founder's sister — as admin and co-approver (founder's request in chat, 19/10/2026).
--   • The «admin» staff role, exactly as Admin › Staff grants it (admin_staff_set): 2FA required, audited STAFF_ADDED,
--     added by the founder. She manages Islamic places, qasidah tracks, du'a recordings and Adhans in the app.
--   • A co-approver in «LCA Approval»: her linked Telegram (760517840) may tap [ ✅ ] [ 🚀 ] [ ❌ ]; every decision is
--     audited by her name (public.tip_chat_approver).
-- Keyed to her account and its Telegram link; does nothing if either has changed.
do $$
declare
  member constant uuid := 'b6866ff8-3da6-41fa-8119-18a103ca7cf5';
  founder constant uuid := '2e110364-2289-4544-a8f5-023549e5adc4';
  tg constant bigint := 760517840;
begin
  if not exists (select 1 from public.telegram_links l where l.user_id = member and l.chat_id = tg) then
    raise notice 'Yerny: account or Telegram link not as expected — nothing granted';
    return;
  end if;
  if not exists (select 1 from public.app_admins a where a.user_id = member) then
    insert into public.app_admins (user_id, role, added_by) values (member, 'admin', founder);
    insert into public.account_controls (user_id, require_2fa) values (member, true)
    on conflict (user_id) do update set require_2fa = true, updated_at = now();
    perform public.audit('STAFF_ADDED', member, 'Founder''s sister Yerny — admin (content and approvals), founder''s request 19/10/2026', null, founder,
      jsonb_build_object('from', null, 'to', 'admin'));
  end if;
  insert into public.content_approvers (telegram_user_id, user_id, name, active, added_by, source)
  values (tg, member, 'Yerny', true, founder, 'command')
  on conflict (telegram_user_id) do update set user_id = excluded.user_id, name = excluded.name, active = true;
  perform public.audit('APPROVER_ADDED', member, 'Yerny (Telegram 760517840) — «LCA Approval»', null, founder);
end $$;
