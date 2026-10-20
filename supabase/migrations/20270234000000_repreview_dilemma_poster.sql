-- Today's money dilemma with its A / B poster and the DTI line in plain Khmer (founder, 20/10/2026 — «text-only will
-- have low engagement»; «DTI» alone confused people): the text-only card in «LCA Approval» is withdrawn and the poster
-- card sent once by the build that knows the flag (REPREVIEW_READY). Only while nobody has decided.
update public.scheduled_posts set payload = payload || jsonb_build_object('repreview', 'dilemma-poster')
 where kind = 'DILEMMA' and post_key = '2026-10-20' and status = 'PENDING';
