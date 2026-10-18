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
  // https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg — CC0 1.0 (own work of the uploader), 2 min 34 s;
  // downloaded 18/10/2026, SHA-1 a1fa4fd942401922c5c3301816384aae86956522, encoded with scripts/adhan-encode.sh.
  // The page does not name the muezzin or say it is a Fajr Adhan, so it stays a general preset.
  {
    id: "commons-cc0",
    name: { km: "អាហ្សាន (Wikimedia Commons)", en: "Adhan (Wikimedia Commons)" },
    file: "/adhan/commons-cc0.mp3",
    credit: "Adam-synagda · Wikimedia Commons · CC0 1.0",
  },
  { id: "makkah", name: { km: "ម៉ាក្កះ (Masjid al-Haram)", en: "Makkah (Masjid al-Haram)" }, file: null, credit: null },
  { id: "madinah", name: { km: "ម៉ាឌីណះ (Masjid an-Nabawi)", en: "Madinah (Masjid an-Nabawi)" }, file: null, credit: null },
  { id: "alafasy", name: { km: "Mishary Rashid Alafasy", en: "Mishary Rashid Alafasy" }, file: null, credit: null },
  { id: "aqsa", name: { km: "អាល់អាក់សា (Al-Aqsa)", en: "Al-Aqsa (Jerusalem)" }, file: null, credit: null },
]

/** Fajr only: includes "As-salatu khayrun minan-nawm". */
export const FAJR_ADHAN: AdhanPreset = { id: "fajr", name: { km: "អាហ្សានស៊ុពហ៍", en: "Fajr Adhan" }, file: null, credit: null }

export const CUSTOM_ADHAN = "custom"

export const availablePresets = () => ADHAN_PRESETS.filter((p) => p.file)
export const presetById = (id: string | null | undefined) => ADHAN_PRESETS.find((p) => p.id === id && p.file)

/**
 * The preset that actually plays for the stored choice: the phone's file when «custom» was picked; the stored
 * preset when it has a file; else (e.g. the old default «makkah», which has none) the phone's file if there is
 * one, otherwise the first built-in recording — never silence while a recording exists.
 */
export function resolvePreset(id: string | null | undefined, hasCustomFile: boolean): AdhanPreset | undefined {
  if (id === CUSTOM_ADHAN) return undefined
  const chosen = presetById(id)
  if (chosen) return chosen
  return hasCustomFile ? undefined : availablePresets()[0]
}
