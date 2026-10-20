-- The Coronation preview again with the founder's new wording (20/10/2026: «ព្រះរាជពិធីគ្រងព្រះបរមសិរីរាជសម្បត្តិ» and
-- the royal opening «ទូលព្រះបង្គំយើងខ្ញុំ… សូមលំឱនកាយថ្វាយព្រះរាជសព្ទសាធុការពរជ័យ»): a still-waiting preview made by the
-- previous release is withdrawn, and the scheduler sends a fresh one within a minute. Only while nobody decided.
delete from public.scheduled_posts
 where kind = 'NATIONAL_DAY' and post_key = 'coronation-2026-10-29' and status = 'PENDING';
