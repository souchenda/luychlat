-- Tonight's 21:00 sleep du'a post (founder, 19/10/2026): its preview in «LCA Approval» shows the old meaning
-- («ក្នុងនាមព្រះអង្គ … (ដេក) … (ភ្ញាក់)»). While it is still waiting and ahead of its time, its preview is cleared, so the
-- scheduler sends a fresh one with the vetted text (scheduled-posts.ts schedulePost). Nothing is approved or
-- published here; once 21:00 has passed this changes nothing.
update public.scheduled_posts
   set previews = '[]'::jsonb
 where kind = 'ISLAMIC_NIGHT' and post_key = '2026-10-19' and status = 'PENDING' and publish_at > now();
