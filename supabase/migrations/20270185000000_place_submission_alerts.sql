-- A member's place suggestion reaches the founder at once (founder, 19/10/2026 — a Kampot surau waited unseen):
-- the dispatcher sends each new pending place to the approval room «LCA Approval» with [ ✅ អនុម័ត ] [ ❌ បដិសេធ ]
-- and a Google Maps link; a super admin's tap approves it (shown to everyone) or rejects it (removed). Places
-- already listed are marked notified; the ones still pending (the Kampot surau) go out on the first pass.

alter table public.islamic_places add column if not exists notified boolean not null default false;
update public.islamic_places set notified = true where approved and not notified;

/** The pending suggestions not sent yet (oldest first), with who suggested them. */
create or replace function public.bot_places_to_notify(p_key text)
returns table (id uuid, kind text, name text, province text, address text, lat double precision, lng double precision, note text, submitter text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  select p.id, p.kind, p.name, p.province, p.address, p.lat, p.lng, p.note,
         coalesce(nullif(btrim(pr.display_name), ''),
                  case when u.email like '%@phone.luy.ibmserp.com' then '+' || split_part(u.email::text, '@', 1) end,
                  '—')
  from public.islamic_places p
  left join public.profiles pr on pr.id = p.created_by
  left join auth.users u on u.id = p.created_by
  where not p.approved and not p.notified
  order by p.created_at
  limit 10;
end $$;
revoke all on function public.bot_places_to_notify(text) from public, anon, authenticated;
grant execute on function public.bot_places_to_notify(text) to anon, authenticated;

create or replace function public.bot_place_mark_notified(p_key text, p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.islamic_places set notified = true where id = p_id;
end $$;
revoke all on function public.bot_place_mark_notified(text, uuid) from public, anon, authenticated;
grant execute on function public.bot_place_mark_notified(text, uuid) to anon, authenticated;

/**
 * [ ✅ ] / [ ❌ ] from the approval room: only a super admin's tap (their linked Telegram). A pending place only, once:
 * 'approved' (listed for everyone), 'rejected' (removed), 'done' (someone already decided), 'missing'.
 */
create or replace function public.bot_place_review(p_key text, p_id uuid, p_approve boolean, p_actor bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  r public.islamic_places;
begin
  perform public.require_bot(p_key);
  actor := public.tip_chat_super_admin(p_actor);
  if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  select * into r from public.islamic_places p where p.id = p_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if r.approved then return jsonb_build_object('status', 'done', 'name', r.name); end if;
  if p_approve then
    update public.islamic_places set approved = true, notified = true where id = p_id;
    perform public.audit('place_approve', null, r.kind || ' · ' || r.name, p_id::text, actor);
    return jsonb_build_object('status', 'approved', 'name', r.name);
  end if;
  delete from public.islamic_places where id = p_id;
  perform public.audit('place_reject', null, r.kind || ' · ' || r.name, p_id::text, actor);
  return jsonb_build_object('status', 'rejected', 'name', r.name);
end $$;
revoke all on function public.bot_place_review(text, uuid, boolean, bigint) from public, anon, authenticated;
grant execute on function public.bot_place_review(text, uuid, boolean, bigint) to anon, authenticated;
