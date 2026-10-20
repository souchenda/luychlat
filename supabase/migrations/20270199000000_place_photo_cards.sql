-- A place suggestion with its photo (founder, 20/10/2026): the member attaches a photo of the mosque's front or the
-- shop's sign (the private bucket place-photos, islamic_places.photo_path — 20261018000000_place_photos.sql), and the
-- card in «LCA Approval» is that photo with the details as its caption, so approvers can see the place before ✅.
-- The claim now also returns the photo's path and how to reach the member (their phone, else their Telegram @).
-- The bucket takes the compressed photo (≤ 1280 px JPEG, well under its 2 MB); the app checks the original ≤ 5 MB.

drop function if exists public.bot_places_to_notify(text);
create function public.bot_places_to_notify(p_key text)
returns table (id uuid, kind text, name text, province text, address text, lat double precision, lng double precision, note text,
               submitter text, islamic boolean, photo_path text, contact text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  with claimed as (
    update public.islamic_places p set notified = true
     where p.id in (select q.id from public.islamic_places q where not q.approved and not q.notified order by q.created_at limit 10 for update skip locked)
    returning p.*
  )
  select c.id, c.kind, c.name, c.province, c.address, c.lat, c.lng, c.note,
         coalesce(nullif(btrim(pr.display_name), ''),
                  case when u.email like '%@phone.luy.ibmserp.com' then '+' || split_part(u.email::text, '@', 1) end,
                  '—'),
         coalesce(s.enabled, false),
         c.photo_path,
         coalesce(case when u.email like '%@phone.luy.ibmserp.com' then '+' || split_part(u.email::text, '@', 1) end,
                  (select '@' || l.username from public.telegram_links l where l.user_id = c.created_by and nullif(l.username, '') is not null limit 1))
  from claimed c
  left join public.profiles pr on pr.id = c.created_by
  left join auth.users u on u.id = c.created_by
  left join public.islamic_settings s on s.user_id = c.created_by;
end $$;
revoke all on function public.bot_places_to_notify(text) from public, anon, authenticated;
grant execute on function public.bot_places_to_notify(text) to anon, authenticated;
