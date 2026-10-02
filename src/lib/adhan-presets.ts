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
  { id: "makkah", name: { km: "ម៉ាក្កះ (Masjid al-Haram)", en: "Makkah (Masjid al-Haram)" }, file: null, credit: null },
  { id: "madinah", name: { km: "ម៉ាឌីណះ (Masjid an-Nabawi)", en: "Madinah (Masjid an-Nabawi)" }, file: null, credit: null },
  { id: "alafasy", name: { km: "Mishary Rashid Alafasy", en: "Mishary Rashid Alafasy" }, file: null, credit: null },
  { id: "aqsa", name: { km: "អាល់អាក់សា (Al-Aqsa)", en: "Al-Aqsa (Jerusalem)" }, file: null, credit: null },
]

/** Fajr only: includes "As-salatu khayrun minan-nawm". */
export const FAJR_ADHAN: AdhanPreset = { id: "fajr", name: { km: "អាហ្សានស៊ូពុហ៍", en: "Fajr Adhan" }, file: null, credit: null }

export const CUSTOM_ADHAN = "custom"

export const availablePresets = () => ADHAN_PRESETS.filter((p) => p.file)
export const presetById = (id: string | null | undefined) => ADHAN_PRESETS.find((p) => p.id === id && p.file)
