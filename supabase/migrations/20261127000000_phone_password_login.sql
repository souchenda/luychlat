-- Phone-number sign-in without SMS: the app signs a Cambodian number up as
-- 855<national>@phone.luy.ibmserp.com with a password (src/lib/auth-identifier.ts).
-- That domain has no mail server, so nothing sent to it reaches anyone.
-- Here: such accounts get their number on the profile (local form, e.g.
-- 078824222) and a default name that doesn't show the internal address.

create or replace function public.is_phone_login_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(p_email) like '%@phone.luy.ibmserp.com', false)
$$;

-- The number of a phone account in local form ("0" + national), or null.
create or replace function public.phone_login_number(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.is_phone_login_email(p_email) and split_part(p_email, '@', 1) ~ '^855[1-9][0-9]{7,8}$'
      then '0' || substr(split_part(p_email, '@', 1), 4)
  end
$$;

create or replace function public.default_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    -- Phone accounts: "•••222", never the internal address.
    case when public.is_phone_login_email(u.email) then '•••' || right(split_part(u.email, '@', 1), 3) end,
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    case when u.phone is not null and u.phone <> '' then '•••' || right(u.phone, 3) end,
    'Member'
  ), 40)
  from auth.users u
  where u.id = p_user_id;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_id uuid;
  business_id uuid;
begin
  insert into public.profiles (id, display_name, phone)
  values (new.id, coalesce(public.default_display_name(new.id), 'Member'), public.phone_login_number(new.email))
  on conflict (id) do nothing;
  insert into public.workspaces (user_id, name, type) values (new.id, 'ផ្ទាល់ខ្លួន', 'PERSONAL')
    returning id into personal_id;
  insert into public.workspaces (user_id, name, type) values (new.id, 'អាជីវកម្ម', 'BUSINESS')
    returning id into business_id;
  perform public.seed_default_categories(personal_id, 'PERSONAL');
  perform public.seed_default_categories(business_id, 'BUSINESS');
  return new;
end;
$$;
