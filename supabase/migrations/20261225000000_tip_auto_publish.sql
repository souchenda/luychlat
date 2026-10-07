-- Daily tip: auto-publish at the 12:00 cut-off (founder's policy change, 2026-10-07).
--
-- The preview still goes to the super admins at 10:30 and they can approve,
-- edit, change or skip it. A tip still in DRAFT at 12:00 is approved by the
-- system (auto_approved, no approving user, audited as DAILY_TIP_AUTO_APPROVE)
-- and posted, so the daily queue never stalls. SKIPPED is respected: a skipped
-- day is never posted. A manual approval clears auto_approved.

alter table public.daily_tips add column if not exists auto_approved boolean not null default false;

create or replace function public.tip_apply(p_actor uuid, p_day date, p_action text, p_version int default null,
                                            p_title text default null, p_body text default null, p_tip_id text default null,
                                            p_poster_path text default null, p_keep_poster boolean default true)
returns public.daily_tips
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.daily_tips;
begin
  if p_day is null or p_day < public.tip_today() then raise exception 'past_day' using errcode = '22023'; end if;
  select * into t from public.daily_tips where day = p_day for update;
  if t.status = 'POSTED' then raise exception 'already_posted' using errcode = 'P0001'; end if;

  if p_action = 'save' then
    if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then raise exception 'empty_tip' using errcode = '22023'; end if;
    insert into public.daily_tips as d (day, tip_id, title, body, poster_path, status, version, updated_by, updated_at)
    values (p_day, p_tip_id, btrim(p_title), btrim(p_body), p_poster_path, 'DRAFT', 1, p_actor, now())
    on conflict (day) do update
      set tip_id = excluded.tip_id, title = excluded.title, body = excluded.body,
          poster_path = case when p_keep_poster and excluded.poster_path is null then d.poster_path else excluded.poster_path end,
          status = 'DRAFT', version = d.version + 1, approved_by = null, approved_at = null, auto_approved = false,
          updated_by = p_actor, updated_at = now()
    returning * into t;
  elsif t.day is null then
    raise exception 'no_tip' using errcode = 'P0001';
  elsif p_action = 'approve' then
    if public.tip_locked(p_day) then raise exception 'too_late' using errcode = 'P0001'; end if;
    if p_version is not null and p_version <> t.version then raise exception 'stale_version' using errcode = 'P0001'; end if;
    update public.daily_tips set status = 'APPROVED', approved_by = p_actor, approved_at = now(), auto_approved = false, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'skip' then
    update public.daily_tips set status = 'SKIPPED', approved_by = null, approved_at = null, auto_approved = false, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  elsif p_action = 'draft' then
    update public.daily_tips set status = 'DRAFT', approved_by = null, approved_at = null, auto_approved = false, updated_by = p_actor, updated_at = now()
     where day = p_day returning * into t;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  perform public.audit('DAILY_TIP_' || upper(p_action), null,
    to_char(p_day, 'YYYY-MM-DD') || ' v' || t.version || ' · ' || left(t.title, 80), null, p_actor);
  return t;
end;
$$;
revoke all on function public.tip_apply(uuid, date, text, int, text, text, text, text, boolean) from public, anon, authenticated;

-- 12:00–12:59: today's DRAFT becomes APPROVED by the system (null when there is nothing to approve).
create or replace function public.bot_tip_auto_approve(p_key text)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
declare t public.daily_tips;
begin
  perform public.require_bot(p_key);
  if not public.tip_locked(public.tip_today()) then return null; end if;
  update public.daily_tips
     set status = 'APPROVED', auto_approved = true, approved_by = null, approved_at = now(), updated_at = now()
   where day = public.tip_today() and status = 'DRAFT'
  returning * into t;
  if t.day is not null then
    perform public.audit('DAILY_TIP_AUTO_APPROVE', null,
      to_char(t.day, 'YYYY-MM-DD') || ' v' || t.version || ' · ' || left(t.title, 80) || ' (no approval by 12:00)', null, null);
  end if;
  return t;
end;
$$;
revoke all on function public.bot_tip_auto_approve(text) from public;
grant execute on function public.bot_tip_auto_approve(text) to anon, authenticated;

-- Posting accepts a super admin's approval or the system's cut-off approval.
create or replace function public.bot_tip_claim_post(p_key text)
returns public.daily_tips
language plpgsql security definer set search_path = '' as $$
declare t public.daily_tips;
begin
  perform public.require_bot(p_key);
  update public.daily_tips set status = 'POSTED', posted_at = now()
   where day = public.tip_today() and status = 'APPROVED' and (approved_by is not null or auto_approved)
  returning * into t;
  if t.day is not null then
    perform public.audit('DAILY_TIP_POSTED', null, to_char(t.day, 'YYYY-MM-DD') || ' v' || t.version || ' · ' || left(t.title, 80) || case when t.auto_approved then ' (auto)' else '' end, null, t.approved_by);
  end if;
  return t;
end;
$$;

select public.apply_security_gate();
