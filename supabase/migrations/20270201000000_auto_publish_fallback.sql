-- Zero-pressure auto-publish fallback (founder, 20/10/2026 — replaces the 18/10 «no tap → never published»): a daily
-- scheduled post that nobody approved or paused by its time is published on schedule, so the work never hangs when
-- the approvers are busy. ❌ before the time still stops it. Never the humour posts (the money dilemma — the founder's
-- 18/10 hard rule for humour and video stands): those still wait for a tap. Logged AUTO_PUBLISHED; the card reads
-- «✅ បានផ្សាយស្វ័យប្រវត្តិតាមកាលវិភាគ» and the nightly card counts it apart from the approvers.

alter table public.scheduled_posts drop constraint if exists scheduled_posts_decided_how_check;
alter table public.scheduled_posts add constraint scheduled_posts_decided_how_check check (decided_how in ('approve', 'publish', 'pause', 'auto'));

-- Humour, a fuel price change and a festival poster wait for a person (lib/scheduled-posts.ts TAP_ONLY_KINDS — compared in
-- scheduled-posts.test.ts).
create or replace function public.post_needs_tap(p_kind text)
returns boolean language sql immutable set search_path = '' as $$ select p_kind in ('DILEMMA', 'FUEL', 'POSTER') $$;

-- The timer: a PENDING post at (not before) its time, at most 90 minutes late, not humour → PUBLISHED, once.
create or replace function public.bot_post_auto_publish(p_key text, p_id bigint)
returns public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_posts;
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts p
     set status = 'PUBLISHED', decided_how = 'auto', decided_at = now(), decided_name = null, decided_username = null
   where p.id = p_id and p.status = 'PENDING' and not public.post_needs_tap(p.kind)
     and now() >= p.publish_at and now() - p.publish_at <= interval '90 minutes'
  returning * into r;
  if r.id is not null then
    perform public.audit('AUTO_PUBLISHED', null, r.kind || ' ' || r.post_key || ' → auto-published on schedule', r.id::text, null);
  end if;
  return r;
end $$;
revoke all on function public.bot_post_auto_publish(text, bigint) from public, anon, authenticated;
grant execute on function public.bot_post_auto_publish(text, bigint) to anon, authenticated;

-- The nightly card: the approvers' decisions (name and Telegram id as audited) and, apart, the posts auto-published.
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
    ), '[]'::jsonb),
    'auto_published', (select count(*) from public.admin_audit_log a where a.at >= t0 and a.at < t1 and a.action = 'AUTO_PUBLISHED')
  );
end $$;
revoke all on function public.bot_nightly_stats(text, date) from public, anon, authenticated;
grant execute on function public.bot_nightly_stats(text, date) to anon, authenticated;
