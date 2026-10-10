-- A verified ATM supplied by the founder (11/10/2026): the ABA ATM at Angk Ta Saom, Tram Kak, Takeo
-- (National Road 3) — not in OpenStreetMap. source 'verified': the weekly OpenStreetMap refresh
-- replaces 'osm' rows only, so it stays. Audited as a system change.
insert into public.bank_atms (osm_ref, bank_code, type, name_kh, name_en, address, province, province_km, latitude, longitude, currencies, is_24h, source) values
  ('v-aba-angk-ta-saom', 'ABA', 'ATM', 'ABA ATM - អង្គតាសោម', 'ABA ATM - Angk Ta Saom', 'ភូមិព្រៃរំដេង ឃុំអង្គតាសោម ស្រុកត្រាំកក់ ខេត្តតាកែវ (ផ្លូវជាតិលេខ ៣)', 'Tram Kak', 'ត្រាំកក់', 11.0194192, 104.6741459, null, true, 'verified')
on conflict (osm_ref) do nothing;

select public.audit('ATM_VERIFIED_ADDED', null, 'ABA ATM - Angk Ta Saom (11.0194192, 104.6741459), supplied by the founder', 'v-aba-angk-ta-saom', null, '{"source": "verified"}'::jsonb);
