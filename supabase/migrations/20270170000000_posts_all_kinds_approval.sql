-- Every public post goes through the founder's approval (founder, 18/10/2026): the 20:00 check-in, the
-- Saturday spotlight, the market bulletin, the evening NBC rates, festival posters and holy-day notes join
-- the 07:00 poster, holiday notes and fuel notices as scheduled_posts — previewed, published only on ✅ / 🚀.
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check
  check (kind in ('MORNING', 'HOLIDAY', 'FUEL', 'EVENING', 'SPOTLIGHT', 'BULLETIN', 'RATES', 'POSTER', 'HOLYDAY'));
