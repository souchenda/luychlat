-- Whether a Telegram user may decide in «LCA Approval» (founder, 25/10/2026 — Task #503): a super admin or an active
-- co-approver. Read-only (no audit — nothing is decided): the bot asks before it turns an approver's reply to the daily
-- tip's card into a proposal, so another member's reply in the group never replaces an approver's pending text.
create or replace function public.bot_is_approver(p_key text, p_tg bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return public.tip_chat_super_admin(p_tg) is not null
      or exists (select 1 from public.content_approvers a where a.telegram_user_id = p_tg and a.active);
end $$;
revoke all on function public.bot_is_approver(text, bigint) from public, anon, authenticated;
grant execute on function public.bot_is_approver(text, bigint) to anon, authenticated;

select public.apply_security_gate();
