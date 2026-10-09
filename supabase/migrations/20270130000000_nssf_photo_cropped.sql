-- Card photos are stored cropped to the card (founder, 09/10 — zero background). Photos stored
-- before that rule are cropped again by the owner's own app (the photos are private: only the
-- owner's session can read them); these flags say which sides are done.
alter table public.nssf_members add column if not exists front_cropped boolean not null default false;
alter table public.nssf_members add column if not exists back_cropped boolean not null default false;
