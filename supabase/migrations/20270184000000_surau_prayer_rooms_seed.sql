-- Prayer rooms (ស៊ូរ៉ាវ / musalla) in malls and airports (founder, 19/10/2026): OpenStreetMap has almost none, yet
-- Muslims rely on them. Listed at once (approved), kind SURAU, source 'community' — so the weekly OpenStreetMap
-- refresh never removes them. The founder supplied the places and floors; the coordinates are OpenStreetMap's for
-- each mall / airport (checked 19/10/2026; the supplied ones were 0.3–2.3 km off — AEON Mean Chey, TIA and SAI
-- most). Phnom Penh International Airport (Pochentong) is not seeded: its passenger flights moved to Techo
-- International Airport in September 2025.

insert into public.islamic_places (kind, name, province, address, lat, lng, note, approved, source, created_by)
select v.kind, v.name, v.province, v.address, v.lat, v.lng, v.note, true, 'community', null
from (values
  ('SURAU', 'បន្ទប់សឡាត AEON Mall 1 (ជាន់ទី ២)', 'ភ្នំពេញ',
   'ជាន់ទី ២ AEON Mall 1, មហាវិថីសម្ដេចសុធារស, សង្កាត់ទន្លេបាសាក់', 11.5481, 104.9326,
   'បន្ទប់សឡាតក្នុងផ្សារទំនើប — សូមសួរព័ត៌មាននៅតុព័ត៌មាន ប្រសិនបើរកមិនឃើញ'),
  ('SURAU', 'បន្ទប់សឡាត AEON Mall Sen Sok City (AEON 2 - ជាន់ទី ២)', 'ភ្នំពេញ',
   'ជាន់ទី ២ AEON Mall Sen Sok City, ខណ្ឌសែនសុខ', 11.6002, 104.8854,
   'បន្ទប់សឡាតក្នុងផ្សារទំនើប — សូមសួរព័ត៌មាននៅតុព័ត៌មាន ប្រសិនបើរកមិនឃើញ'),
  ('SURAU', 'បន្ទប់សឡាត AEON Mall Mean Chey (AEON 3 - ជាន់ទី ២)', 'ភ្នំពេញ',
   'ជាន់ទី ២ AEON Mall Mean Chey, មហាវិថីសម្ដេចហ៊ុនសែន (ផ្លូវ ៦០ ម៉ែត្រ), ខណ្ឌមានជ័យ', 11.4834, 104.9177,
   'បន្ទប់សឡាតក្នុងផ្សារទំនើប — សូមសួរព័ត៌មាននៅតុព័ត៌មាន ប្រសិនបើរកមិនឃើញ'),
  ('SURAU', 'បន្ទប់សឡាត ព្រលានយន្តហោះអន្តរជាតិតេជោ (Techo International Airport - TIA)', 'កណ្ដាល',
   'ស្ថានីយអ្នកដំណើរ ព្រលានយន្តហោះអន្តរជាតិតេជោ, ក្រុងតាខ្មៅ', 11.3563, 104.9317,
   'ក្នុងស្ថានីយអ្នកដំណើរ — ទីតាំងលើផែនទីជាចំណុចកណ្ដាលព្រលានយន្តហោះ'),
  ('SURAU', 'បន្ទប់សឡាត ព្រលានយន្តហោះអន្តរជាតិ សៀមរាប-អង្គរ (SAI)', 'សៀមរាប',
   'ស្ថានីយអ្នកដំណើរអន្តរជាតិ សៀមរាប-អង្គរ', 13.3678, 104.2155,
   'ក្នុងស្ថានីយអ្នកដំណើរ — ទីតាំងលើផែនទីជាចំណុចកណ្ដាលព្រលានយន្តហោះ')
) as v(kind, name, province, address, lat, lng, note)
where not exists (select 1 from public.islamic_places p where p.name = v.name);
