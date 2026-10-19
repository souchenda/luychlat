-- Fix (19/10/2026, regression): admin_audit_log.action must match ^[A-Z0-9_]{3,40}$, but today's functions logged
-- 'place_approve', 'dua_recording_set', 'adhan_preset_add'… in lower case — the audit insert failed and took the whole
-- action with it («មិនអាចរក្សាទុកបានទេ» on [ ✅ អនុម័ត ] in «LCA Approval»; the du'a and Adhan uploads would fail the
-- same way). The roadmap's 'roadmap.add' / 'roadmap.update' (16/12/2026) had the same fault. Each function is rebuilt
-- from its live definition with only the action names changed (same signature, same grants); the place review also
-- returns the province, for the «✅ បានអនុម័តជោគជ័យ — ទីតាំង … (…)» line.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'public.bot_place_review(text,uuid,boolean,bigint)',
    'public.dua_recording_put(uuid,text,text,text,text)',
    'public.dua_recording_remove(text)',
    'public.adhan_preset_add(text,text,text,text,text)',
    'public.adhan_preset_remove(uuid)',
    'public.dev_roadmap_save(jsonb)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    def := replace(def, '''place_approve''', '''PLACE_APPROVE''');
    def := replace(def, '''place_reject''', '''PLACE_REJECT''');
    def := replace(def, '''dua_recording_set''', '''DUA_RECORDING_SET''');
    def := replace(def, '''dua_recording_remove''', '''DUA_RECORDING_REMOVE''');
    def := replace(def, '''adhan_preset_add''', '''ADHAN_PRESET_ADD''');
    def := replace(def, '''adhan_preset_remove''', '''ADHAN_PRESET_REMOVE''');
    def := replace(def, '''roadmap.add''', '''ROADMAP_ADD''');
    def := replace(def, '''roadmap.update''', '''ROADMAP_UPDATE''');
    def := replace(def, '''name'', r.name)', '''name'', r.name, ''province'', r.province)');
    execute def;
  end loop;
end $$;
