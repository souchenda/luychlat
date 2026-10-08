-- Business categories (founder, 09/10):
--   * new «ចំណាយប្រតិបត្តិការ» (operating): telecom top-ups and other running costs —
--     never «ចំណាយផ្សេងៗ», and never «ទឹកភ្លើង» (utilities stay EDC and water only);
--   * payroll is «ប្រាក់បៀវត្ស និងអត្ថប្រយោជន៍» (Khmer standard: និង, never &).
-- New businesses get both from seed_default_categories; existing ones are brought up to date
-- here. A payroll category the owner renamed keeps its name.

create or replace function public.seed_default_categories(p_workspace_id uuid, p_type public.workspace_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type in ('PERSONAL', 'FAMILY') then
    insert into public.categories (workspace_id, preset_key, type, icon, color, name) values
      (p_workspace_id, 'food',          'EXPENSE', 'utensils',       '#f97316', 'ម្ហូបអាហារ'),
      (p_workspace_id, 'transport',     'EXPENSE', 'bus',            '#0ea5e9', 'ការធ្វើដំណើរ'),
      (p_workspace_id, 'housing',       'EXPENSE', 'house',          '#8b5cf6', 'ផ្ទះ/ទឹកភ្លើង'),
      (p_workspace_id, 'shopping',      'EXPENSE', 'shopping-bag',   '#ec4899', 'ទិញឥវ៉ាន់'),
      (p_workspace_id, 'phone',         'EXPENSE', 'smartphone',     '#6366f1', 'ទូរស័ព្ទ/អ៊ីនធឺណិត'),
      (p_workspace_id, 'health',        'EXPENSE', 'heart-pulse',    '#ef4444', 'សុខភាព'),
      (p_workspace_id, 'education',     'EXPENSE', 'graduation-cap', '#14b8a6', 'ការសិក្សា'),
      (p_workspace_id, 'family',        'EXPENSE', 'gift',           '#d946ef', 'គ្រួសារ/អំណោយ'),
      (p_workspace_id, 'entertainment', 'EXPENSE', 'film',           '#f59e0b', 'កម្សាន្ត'),
      (p_workspace_id, 'other_expense', 'EXPENSE', 'ellipsis',       '#64748b', 'ចំណាយផ្សេងៗ'),
      (p_workspace_id, 'salary',        'INCOME',  'banknote',       '#16a34a', 'ប្រាក់ខែ'),
      (p_workspace_id, 'bonus',         'INCOME',  'award',          '#22c55e', 'ប្រាក់រង្វាន់'),
      (p_workspace_id, 'side_income',   'INCOME',  'trending-up',    '#10b981', 'ចំណូលបន្ថែម'),
      (p_workspace_id, 'gift_received', 'INCOME',  'hand-heart',     '#84cc16', 'ទទួលអំណោយ'),
      (p_workspace_id, 'other_income',  'INCOME',  'coins',          '#64748b', 'ចំណូលផ្សេងៗ');
  else
    insert into public.categories (workspace_id, preset_key, type, icon, color, name) values
      (p_workspace_id, 'inventory',     'EXPENSE', 'package',        '#f97316', 'ថ្លៃទំនិញ/ស្តុក'),
      (p_workspace_id, 'rent',          'EXPENSE', 'store',          '#8b5cf6', 'ជួលទីតាំង'),
      (p_workspace_id, 'payroll',       'EXPENSE', 'users',          '#0ea5e9', 'ប្រាក់បៀវត្ស និងអត្ថប្រយោជន៍'),
      (p_workspace_id, 'utilities',     'EXPENSE', 'zap',            '#eab308', 'ទឹកភ្លើង'),
      (p_workspace_id, 'operating',     'EXPENSE', 'briefcase',      '#0891b2', 'ចំណាយប្រតិបត្តិការ'),
      (p_workspace_id, 'marketing',     'EXPENSE', 'megaphone',      '#ec4899', 'ផ្សព្វផ្សាយ'),
      (p_workspace_id, 'delivery',      'EXPENSE', 'truck',          '#14b8a6', 'ដឹកជញ្ជូន'),
      (p_workspace_id, 'equipment',     'EXPENSE', 'wrench',         '#6366f1', 'សម្ភារៈ/ជួសជុល'),
      (p_workspace_id, 'tax',           'EXPENSE', 'landmark',       '#ef4444', 'ពន្ធ/សេវា'),
      (p_workspace_id, 'other_expense', 'EXPENSE', 'ellipsis',       '#64748b', 'ចំណាយផ្សេងៗ'),
      (p_workspace_id, 'sales',         'INCOME',  'shopping-cart',  '#16a34a', 'ចំណូលពីការលក់'),
      (p_workspace_id, 'services',      'INCOME',  'briefcase',      '#10b981', 'ចំណូលពីសេវាកម្ម'),
      (p_workspace_id, 'investment',    'INCOME',  'piggy-bank',     '#84cc16', 'ដើមទុនវិនិយោគ'),
      (p_workspace_id, 'other_income',  'INCOME',  'coins',          '#64748b', 'ចំណូលផ្សេងៗ');
  end if;
  perform public.ensure_preset_category(p_workspace_id, 'tontine_payment', 'EXPENSE', 'piggy-bank', '#f59e0b', 'បង់តុងទីន');
  perform public.ensure_preset_category(p_workspace_id, 'tontine_payout', 'INCOME', 'coins', '#10b981', 'ដេញតុងទីនបាន');
end;
$$;
revoke all on function public.seed_default_categories(uuid, public.workspace_type) from public, anon, authenticated;

-- Existing businesses: the new category, and the payroll name where it is still the old default.
do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces where type = 'BUSINESS' loop
    perform public.ensure_preset_category(ws.id, 'operating', 'EXPENSE', 'briefcase', '#0891b2', 'ចំណាយប្រតិបត្តិការ');
  end loop;
end $$;
update public.categories set name = 'ប្រាក់បៀវត្ស និងអត្ថប្រយោជន៍'
where preset_key = 'payroll' and name = 'ប្រាក់បៀវត្សបុគ្គលិក';

select public.apply_security_gate();
