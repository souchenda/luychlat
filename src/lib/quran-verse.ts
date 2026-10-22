/**
 * A Quran verse quoted in an Islamic post or lesson, from the official Khmer translation (founder, 22/10/2026 — Task
 * #460: Nuryerny no longer opens QuranEnc, copies the text and edits the card). The text is QuranEnc's «khmer_cambodia»
 * (Islamic Community Development Association, Cambodia — lib/quran.ts QURAN_TRANSLATION), passed through UNMODIFIED and
 * always the latest version (QuranEnc's conditions — lib/server/quran-verses.ts reads it as the app's reader does). Never
 * re-translated or approximated. Pure.
 */
import { surahByNumber } from "@/lib/quran"

/** The founder's citation words (Task #460). */
export const SURAH_WORD = "ស៊ូរ៉ាត់"
export const AYAH_WORD = "អាយ៉ាត់"

/** One verse as QuranEnc gives it (strings, as the API sends them). */
export type QuranEncVerse = { sura: string; aya: string; arabic_text: string; translation: string; footnotes: string }

export type QuranVerseText = { suraNumber: number; ayaNumber: number; suraName: string; arabic: string; khmer: string; footnotes: string | null }

/** «(ស៊ូរ៉ាត់ Al-Baqarah : អាយ៉ាត់ 255)», «(ស៊ូរ៉ាត់ Al-Jumu'ah : អាយ៉ាត់ 9–10)» — the surah's name as the app's reader shows it. */
export function verseCitation(sura: number, from: number, to: number = from): string {
  const ayat = to > from ? `${from}–${to}` : String(from)
  return `(${SURAH_WORD} ${surahByNumber(sura).latin} : ${AYAH_WORD} ${ayat})`
}

/** A lesson's quran.com link → the verses it cites: «https://quran.com/62/9-10» → { sura 62, from 9, to 10 }. */
export function quranRefOf(url: string): { sura: number; from: number; to: number } | null {
  const m = /^https:\/\/quran\.com\/(\d{1,3})\/(\d{1,3})(?:[-–](\d{1,3}))?\/?$/.exec(url.trim())
  if (!m) return null
  const sura = Number(m[1])
  const from = Number(m[2])
  const to = m[3] ? Number(m[3]) : from
  if (sura < 1 || sura > 114 || from < 1 || to < from || to > surahByNumber(sura).ayat) return null
  return { sura, from, to }
}

/** QuranEnc's row → the verse, its text exactly as given (only the surrounding blanks trimmed). */
export function verseFromRow(row: QuranEncVerse): QuranVerseText {
  const sura = Number(row.sura)
  return { suraNumber: sura, ayaNumber: Number(row.aya), suraName: surahByNumber(sura).latin, arabic: row.arabic_text.trim(), khmer: row.translation.trim(), footnotes: row.footnotes?.trim() || null }
}
