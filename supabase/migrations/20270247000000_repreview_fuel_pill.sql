-- The fuel poster's pill (founder, 21/10/2026 — Task #432): «តម្លៃប្រេងសាំង», its words alone (the small drawn pump read as a
-- «▯» box), with «app.luychlat.com» in the footer (Task #431). The waiting #36200 card is sent again (REPREVIEW_READY
-- «fuel-pill»), only while it still waits.
update public.scheduled_posts
   set payload = payload || jsonb_build_object('repreview', 'fuel-pill')
 where kind = 'FUEL' and post_key = 'notice-36200' and status = 'PENDING';
