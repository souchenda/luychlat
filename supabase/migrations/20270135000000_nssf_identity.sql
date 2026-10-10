-- NSSF members: the card's identity kept as printed, separately — the Khmer name stays in `name`,
-- the Latin name, birth date and gender in their own fields, and the card's QR text (read on the
-- phone, shown full-screen for hospital staff to scan).
alter table public.nssf_members add column if not exists name_en text check (name_en is null or (char_length(name_en) <= 80 and name_en ~ '^[A-Za-z][A-Za-z .''-]*$'));
alter table public.nssf_members add column if not exists dob date check (dob is null or dob > date '1900-01-01');
alter table public.nssf_members add column if not exists gender text check (gender is null or gender in ('MALE', 'FEMALE'));
alter table public.nssf_members add column if not exists qr_text text check (qr_text is null or char_length(qr_text) <= 1000);
