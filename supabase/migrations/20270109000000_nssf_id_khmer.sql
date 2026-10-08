-- NSSF card numbers can end in a Khmer letter ("1870219-1998577-ឈ"): the ID may
-- now hold Khmer letters as well (filled in from the card by OCR, or typed).
alter table public.nssf_members drop constraint if exists nssf_members_nssf_id_check;
alter table public.nssf_members add constraint nssf_members_nssf_id_check
  check (nssf_id is null or (char_length(nssf_id) <= 40 and nssf_id ~ '^[A-Za-z0-9ក-៹ ./-]*$'));
