-- The nightly report before midnight (founder, 19/10/2026): today's counts for the 23:30 card in «LCA Approval» —
-- new members, and the approvals decided (posts, the daily tip, qasidah, places; the founder's and co-approvers').
-- Counts only, no names.
create or replace function public.bot_nightly_stats(p_key text, p_day date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t0 timestamptz := (p_day::timestamp at time zone 'Asia/Phnom_Penh');
  t1 timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Phnom_Penh');
begin
  perform public.require_bot(p_key);
  return jsonb_build_object(
    'new_users', (select count(*) from auth.users u where u.created_at >= t0 and u.created_at < t1),
    'approvals', (select count(*) from public.admin_audit_log a where a.at >= t0 and a.at < t1
                   and a.action in ('FOUNDER_DECISION', 'CO_APPROVER_DECISION')),
    'total_users', (select count(*) from auth.users)
  );
end $$;
revoke all on function public.bot_nightly_stats(text, date) from public, anon, authenticated;
grant execute on function public.bot_nightly_stats(text, date) to anon, authenticated;
