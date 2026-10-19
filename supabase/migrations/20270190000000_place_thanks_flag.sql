-- Every approved suggestion thanks its member once (founder, 19/10/2026): a tap in «LCA Approval» thanks at once and
-- marks it; a place approved any other way (in the app, or on the founder's word like the Kampot surau) is thanked by
-- the dispatcher within a minute. Already-approved places are marked thanked — except the Kampot surau, whose
-- submitter Yerny was never thanked (the founder asked for it).

alter table public.islamic_places add column if not exists thanked boolean not null default false;
update public.islamic_places set thanked = true
 where approved and not thanked and id <> 'ce93c64c-3436-4fd5-aae6-a0477e7842e8';

-- The tap's approval marks it thanked (the handler thanks at once). Rebuilt from the live definition; one match only.
do $$
declare
  def text := pg_get_functiondef('public.bot_place_review(text,uuid,boolean,bigint)'::regprocedure);
  old_text text := 'set approved = true, notified = true where id = p_id';
begin
  if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'place thanks: bot_place_review does not match';
  end if;
  execute replace(def, old_text, 'set approved = true, notified = true, thanked = true where id = p_id');
end $$;

/** The approved suggestions not thanked yet, each claimed once (oldest first). */
create or replace function public.bot_places_to_thank(p_key text)
returns table (id uuid, name text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  update public.islamic_places p set thanked = true
   where p.id in (select q.id from public.islamic_places q
                   where q.approved and not q.thanked and q.source = 'community' and q.created_by is not null
                   order by q.created_at limit 10 for update skip locked)
  returning p.id, p.name;
end $$;
revoke all on function public.bot_places_to_thank(text) from public, anon, authenticated;
grant execute on function public.bot_places_to_thank(text) to anon, authenticated;
