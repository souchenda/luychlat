/**
 * Built-in Adhan recordings, played from /public/adhan/ (cached by the
 * service worker after the first play, so alerts work offline).
 *
 * A preset only shows in the app once its file is listed here (`file`), and
 * only recordings we hold a licence for may be added: the Haramain broadcasts
 * and well-known reciters' recordings are copyrighted. Record the source and
 * licence of each file in `credit`. Encode with scripts/adhan-encode.sh
 * (64 kbps mono MP3, about 300 KB each).
 */

export type AdhanPreset = {
  id: string
  name: { km: string; en: string }
  /** Path under /public, e.g. "/adhan/makkah.mp3"; null until a licensed file is added. */
  file: string | null
  /** Reciter / source and licence, shown under the name. */
  credit: string | null
}

/** General presets (any prayer). */
export const ADHAN_PRESETS: AdhanPreset[] = [
  // All three from https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg — CC0 1.0 (own work of the uploader),
  // 2 min 34 s; downloaded 18/10/2026, SHA-1 a1fa4fd942401922c5c3301816384aae86956522. 12 sung phrases with ~1–2.5 s
  // between them. The page does not name the muezzin or say it is a Fajr Adhan, so they stay general presets.
  // Natural Pace (the default, first): every phrase kept; pauses capped at 1.5 s and atempo=1.15 → 2 min 14 s:
  //   silenceremove=stop_periods=-1:stop_duration=1.5:stop_threshold=-25dB:stop_silence=1.5,atempo=1.15,loudnorm
  {
    id: "commons-cc0-natural",
    name: { km: "អាហ្សានល្បឿនធម្មជាតិ (Natural Pace)", en: "Adhan — Natural Pace" },
    file: "/adhan/commons-cc0-natural.mp3",
    credit: "Adam-synagda · Wikimedia Commons · CC0 1.0 · ២ នាទី ១៤ វិនាទី",
  },
  // Short Alert: the opening Takbeer (Allahu Akbar ×4, 0–31.1 s, cut in the pause after it), same pace, faded → 27 s.
  {
    id: "commons-cc0-short",
    name: { km: "អាហ្សានកម្រិតខ្លី (Short Alert)", en: "Adhan — Short Alert" },
    file: "/adhan/commons-cc0-short.mp3",
    credit: "តាក់បៀរដំបូង (Allahu Akbar ×៤) · ២៧ វិនាទី · CC0 1.0",
  },
  // Traditional Full: the recording as published (scripts/adhan-encode.sh). Its id is kept for those who chose it.
  {
    id: "commons-cc0",
    name: { km: "អាហ្សានដើម (Traditional Full)", en: "Adhan — Traditional Full" },
    file: "/adhan/commons-cc0.mp3",
    credit: "Adam-synagda · Wikimedia Commons · CC0 1.0 · ២ នាទី ៣៤ វិនាទី",
  },
  { id: "makkah", name: { km: "ម៉ាក្កះ (Masjid al-Haram)", en: "Makkah (Masjid al-Haram)" }, file: null, credit: null },
  { id: "madinah", name: { km: "ម៉ាឌីណះ (Masjid an-Nabawi)", en: "Madinah (Masjid an-Nabawi)" }, file: null, credit: null },
  { id: "alafasy", name: { km: "Mishary Rashid Alafasy", en: "Mishary Rashid Alafasy" }, file: null, credit: null },
  { id: "aqsa", name: { km: "អាល់អាក់សា (Al-Aqsa)", en: "Al-Aqsa (Jerusalem)" }, file: null, credit: null },
]

/**
 * Fajr only: the Fajr Adhan has the Tathweeb «الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ» twice after «حَيَّ عَلَى الْفَلَاحِ»; the
 * other four never do. Set `file` (and `credit`) once a licensed Fajr recording is added — it then plays at Fajr
 * only, and the «អាហ្សានស៊ុពហ៍» switch appears in the alert settings.
 */
export const FAJR_ADHAN: AdhanPreset = { id: "fajr", name: { km: "អាហ្សានស៊ុពហ៍", en: "Fajr Adhan" }, file: null, credit: null }

export const CUSTOM_ADHAN = "custom"

/** The bundled presets with a file, then the ones the admin published for everyone (`global`, from the database). */
export const availablePresets = (global: AdhanPreset[] = []) => [...ADHAN_PRESETS, ...global].filter((p) => p.file)
export const presetById = (id: string | null | undefined, global: AdhanPreset[] = []) => availablePresets(global).find((p) => p.id === id)

/**
 * The preset that actually plays for the stored choice: the phone's file when «custom» was picked; the stored
 * preset when it has a file; else (e.g. the old default «makkah», which has none) the phone's file if there is
 * one, otherwise the first built-in recording — never silence while a recording exists.
 */
export function resolvePreset(id: string | null | undefined, hasCustomFile: boolean, global: AdhanPreset[] = []): AdhanPreset | undefined {
  if (id === CUSTOM_ADHAN) return undefined
  const chosen = presetById(id, global)
  if (chosen) return chosen
  return hasCustomFile ? undefined : availablePresets()[0]
}

/**
 * The recording for a prayer: the Fajr Adhan (with the Tathweeb) at Fajr only — when it exists and the switch is
 * on — else the chosen preset, else the phone's file ({}). Dhuhr, Asr, Maghrib and Isha never get the Fajr Adhan.
 */
export function adhanForPrayer(
  prayer: string | null,
  presetId: string | null | undefined,
  fajrSwitch: boolean,
  hasCustomFile: boolean,
  fajr: AdhanPreset = FAJR_ADHAN,
  global: AdhanPreset[] = [],
): { presetFile?: string; presetId?: string } {
  if (prayer === "fajr" && fajrSwitch && fajr.file) return { presetFile: fajr.file, presetId: fajr.id }
  const preset = resolvePreset(presetId, hasCustomFile, global)
  return preset?.file ? { presetFile: preset.file, presetId: preset.id } : {}
}

/** Whether the app has its own Fajr recording yet (the prayer page says so honestly when not). */
export const hasFajrRecording = () => Boolean(FAJR_ADHAN.file)

/*
 * Published by the admin for everyone (founder, 19/10/2026 — no code change, no deploy): in the alert settings a super
 * admin picks a file and chooses «ដាក់ចូលអេប ប្រើរួមគ្នាទាំងអស់»; the server cleans it into the public bucket
 * «adhan-audio» and registers it (table adhan_presets). Everyone else — and the admin's «សម្រាប់តែឧបករណ៍នេះ» — keeps
 * the file on the phone only (IndexedDB), as before.
 */
export type AdhanScope = "device" | "global"
export const GLOBAL_ADHAN_BUCKET = "adhan-audio"
export const GLOBAL_ADHAN_PREFIX = "g:"
/** A published Adhan is cut at 6 minutes (a full Adhan with its du'a takes 3–5). */
export const GLOBAL_ADHAN_MAX_SECONDS = 360
/** A file to publish goes through Nginx (10 MB a request); a larger one can still be kept on the device. */
export const GLOBAL_ADHAN_MAX_BYTES = 9 * 1024 * 1024

/** Only a super admin may publish for everyone (the database checks again: adhan_preset_add). */
export const canPublishGlobally = (staffRole: string | null | undefined) => staffRole === "super_admin"

export type GlobalAdhanRow = { id: string; name_km: string; name_en: string | null; credit: string; audio_path: string }

export const isGlobalAdhanPath = (path: unknown): path is string => typeof path === "string" && /^[0-9a-f-]{36}\.mp3$/.test(path)

/** A database row as a preset: «g:<id>», played from the public bucket. */
export function globalAdhanPreset(row: GlobalAdhanRow, supabaseUrl: string): AdhanPreset | null {
  if (!isGlobalAdhanPath(row.audio_path)) return null
  return {
    id: `${GLOBAL_ADHAN_PREFIX}${row.id}`,
    name: { km: row.name_km, en: row.name_en?.trim() || row.name_km },
    file: `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${GLOBAL_ADHAN_BUCKET}/${row.audio_path}`,
    credit: row.credit,
  }
}

/** What a global upload needs: the Khmer name, who recited it, and the rights confirmed (the file is checked apart). */
export function globalAdhanError(v: { nameKm: string; credit: string; rights: boolean }): "adhanUpload.nameRequired" | "adhanUpload.creditRequired" | "adhanUpload.rightsRequired" | null {
  if (v.nameKm.trim().length < 2) return "adhanUpload.nameRequired"
  if (v.credit.trim().length < 2) return "adhanUpload.creditRequired"
  if (!v.rights) return "adhanUpload.rightsRequired"
  return null
}
