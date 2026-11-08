-- khqr_payments still allowed only ACLEDA / ABA (20261211000000), so a PPCBank sale for «ហាងឆ្លាត» failed
-- with khqr_payments_bank_check after khqr_record began accepting PPCBANK (20270301000000) — founder's test
-- payments of 8/11/2026 17:13 and 17:15, never booked (the whole call rolls back). PPCBANK joins the list.
alter table public.khqr_payments drop constraint if exists khqr_payments_bank_check;
alter table public.khqr_payments add constraint khqr_payments_bank_check check (bank in ('ACLEDA', 'ABA', 'PPCBANK'));
