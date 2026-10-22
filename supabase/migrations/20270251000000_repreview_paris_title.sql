-- 23 October (founder, 22/10/2026 — Task #457): the poster's title in the founder's two lines — «ទិវារំលឹកខួប» /
-- «នៃកិច្ចព្រមព្រៀងសន្តិភាពទីក្រុងប៉ារីស» (posterTitle). The waiting card is withdrawn and sent again with the new poster
-- (REPREVIEW_READY «paris-title»), only while it still waits for the founder's tap.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'paris-title')
 where kind = 'NATIONAL_DAY' and post_key = 'paris-peace-2026-10-23' and status = 'PENDING';
