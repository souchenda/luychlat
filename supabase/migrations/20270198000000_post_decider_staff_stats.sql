-- Who decided, on the approval card (founder, 20/10/2026): the Telegram name and @username of the person who tapped
-- ✅ / 🚀 / ❌ on a scheduled post, shown on the card in «LCA Approval» with the time (decided_at). The decision itself is
-- still audited by tip_chat_approver (name and Telegram id); this only labels the card.
alter table public.scheduled_posts
  add column if not exists decided_name text,
  add column if not exists decided_username text,
  add column if not exists decided_how text check (decided_how in ('approve', 'publish', 'pause'));

-- Only the person who really decided (their Telegram id resolves to decided_by), and only right after the tap.
create or replace function public.bot_post_set_decider(p_key text, p_id bigint, p_tg bigint, p_name text, p_username text, p_how text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  perform public.require_bot(p_key);
  uid := public.tip_chat_approver(p_tg);
  if uid is null or p_how not in ('approve', 'publish', 'pause') then return; end if;
  update public.scheduled_posts
     set decided_name = left(nullif(btrim(coalesce(p_name, '')), ''), 80),
         decided_username = left(nullif(regexp_replace(coalesce(p_username, ''), '[^A-Za-z0-9_]', '', 'g'), ''), 40),
         decided_how = p_how
   where id = p_id and decided_by = uid and decided_at > now() - interval '10 minutes'
     and status in ('APPROVED', 'PUBLISHED', 'PAUSED');
end $$;
revoke all on function public.bot_post_set_decider(text, bigint, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_post_set_decider(text, bigint, bigint, text, text, text) to anon, authenticated;

-- The nightly card's staff performance: today's decisions per approver, the name and Telegram id as audited by
-- tip_chat_approver («… · by {name} (Telegram {id})»). Goes to the founder's private chat only.
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
