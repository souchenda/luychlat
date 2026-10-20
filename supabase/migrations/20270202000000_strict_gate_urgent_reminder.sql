-- ZERO UNAPPROVED PUBLIC POSTS, restored (founder, 20/10/2026 — «NO! Posts must NOT go out automatically!»): the
-- on-schedule fallback of 20270201000000 is removed. Silence = HOLD: a post nobody tapped stays PENDING after its time —
-- never published by the timer — and the founder gets an URGENT reminder in his private chat with
-- [ ✅ អនុម័ត និងផ្សាយឥឡូវនេះ ] [ ❌ ផ្អាកថ្ងៃនេះ ]. It waits for his tap until the end of its day (Cambodia time).

drop function if exists public.bot_post_auto_publish(text, bigint);
drop function if exists public.post_needs_tap(text);

-- How many urgent reminders a held post has had (at its time, then one hour later).
alter table public.scheduled_posts add column if not exists reminders smallint not null default 0;

-- Claims reminder number p_level once (a held post, still PENDING, its time come): true for the one pass that sends it.
create or replace function public.bot_post_remind_claim(p_key text, p_id bigint, p_level smallint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts set reminders = p_level
   where id = p_id and status = 'PENDING' and publish_at <= now() and reminders < p_level;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.bot_post_remind_claim(text, bigint, smallint) from public, anon, authenticated;
grant execute on function public.bot_post_remind_claim(text, bigint, smallint) to anon, authenticated;

-- The nightly card without the auto-published count (nothing is auto-published any more).
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
    'total_users', (select count(*) from auth.users),
    'by_approver', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'count', s.n) order by s.n desc, s.name)
        from (
          select (array_agg(m[1] order by a.at desc))[1] as name, count(*) as n
            from public.admin_audit_log a
            cross join lateral regexp_match(a.note, ' · by (.+) \(Telegram (-?[0-9]+)\)$') as m
           where a.at >= t0 and a.at < t1 and a.action in ('FOUNDER_DECISION', 'CO_APPROVER_DECISION')
           group by coalesce(m[2], a.actor_id::text)
        ) s
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.bot_nightly_stats(text, date) from public, anon, authenticated;
grant execute on function public.bot_nightly_stats(text, date) to anon, authenticated;
