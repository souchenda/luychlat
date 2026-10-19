-- A contact email for every member (founder, 19/10/2026): phone-registered members (sign-in «855…@phone.luy.ibmserp.com»,
-- which must never change) can add an email in «My profile». It is a private contact detail (profile_private: the
-- owner, and the super admin's tools), never the sign-in — the sign-in stays the phone.
alter table public.profile_private add column if not exists contact_email text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_private_contact_email_check') then
    alter table public.profile_private add constraint profile_private_contact_email_check check (
      contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                                and lower(contact_email) not like '%@phone.luy.ibmserp.com'));
  end if;
end $$;
create index if not exists profile_private_contact_email_idx on public.profile_private (lower(contact_email)) where contact_email is not null;

-- Admin › Staff finds a member by sign-in email, by phone (the app turns «096 263 7581» into its sign-in), or by the
-- contact email they added. Rebuilt from the live definition; one match only.
do $$
declare
  def text := pg_get_functiondef('public.admin_staff_set(text,text,text)'::regprocedure);
  old_text text := 'select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));';
begin
  if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'contact email: admin_staff_set does not match';
  end if;
  execute replace(def, old_text, old_text || '
  if v_user is null then
    select pp.user_id into v_user from public.profile_private pp where lower(pp.contact_email) = lower(btrim(p_email)) limit 1;
  end if;');
end $$;
