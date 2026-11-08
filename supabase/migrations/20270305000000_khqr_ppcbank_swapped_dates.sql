-- PPCBank prints day first («08/11/2026 05:38 PM»); AUTOBOK read it month first and the shop's KHQR sale of
-- 8 November 2026 was booked on 11 August (fixed in AUTOBOK: bankTimeToIso). Put back the day the bank meant:
-- only PPCBank KHQR rows whose booked day, with day and month swapped, is the day they were recorded.
update public.transactions t
set transaction_date = make_timestamptz(
      extract(year from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
      extract(day from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
      extract(month from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
      extract(hour from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
      extract(minute from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
      extract(second from t.transaction_date at time zone 'Asia/Phnom_Penh'),
      'Asia/Phnom_Penh')
from public.khqr_payments k
where k.transaction_id = t.id and k.bank = 'PPCBANK'
  and extract(day from t.transaction_date at time zone 'Asia/Phnom_Penh') <= 12
  and (t.transaction_date at time zone 'Asia/Phnom_Penh')::date <> (t.created_at at time zone 'Asia/Phnom_Penh')::date
  and make_date(
        extract(year from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
        extract(day from t.transaction_date at time zone 'Asia/Phnom_Penh')::int,
        extract(month from t.transaction_date at time zone 'Asia/Phnom_Penh')::int)
      = (t.created_at at time zone 'Asia/Phnom_Penh')::date;
