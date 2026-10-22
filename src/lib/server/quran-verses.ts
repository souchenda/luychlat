// Server only: verses of the official Khmer translation (QuranEnc «khmer_cambodia») for the Islamic posts and lessons
// (founder, 22/10/2026 — Task #460; lib/quran-verse.ts). As the app's reader (/api/quran/[sura]) and on QuranEnc's
// conditions: the text unmodified, always the latest version — the version list is checked once a day and a new version
// clears what is held. A surah is fetched once and held in memory; nothing is ever re-translated. Null when QuranEnc
// cannot be reached — the post keeps its link to the verse, it never shows an approximation.
import { QURAN_TRANSLATION, surahByNumber } from "@/lib/quran"
import { verseFromRow, type QuranEncVerse, type QuranVerseText } from "@/lib/quran-verse"

import { logEvent } from "./events"

const API = "https://quranenc.com/api/v1"
const DAY_MS = 86_400_000

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

let version: { value: string | null; at: number } | null = null
const surahs = new Map<string, QuranEncVerse[]>()

async function currentVersion(fetchFn: Fetch, now: number): Promise<string | null> {
  if (version && now - version.at < DAY_MS) return version.value
  try {
    const res = await fetchFn(`${API}/translations/list/km`, { signal: AbortSignal.timeout(15_000) })
    const list = res.ok ? ((await res.json()) as { translations?: { key: string; version: string }[] }) : null
    const value = list?.translations?.find((t) => t.key === QURAN_TRANSLATION.key)?.version ?? version?.value ?? null
    if (version && value !== version.value) surahs.clear() // a new version replaces the old text
    version = { value, at: now }
    return value
  } catch {
    return version?.value ?? null
  }
}

/** The verses `from`–`to` of a surah, as QuranEnc gives them; null when they cannot be had complete. */
export async function getQuranVerses(sura: number, from: number, to: number = from, deps: { fetch?: Fetch; now?: number } = {}): Promise<QuranVerseText[] | null> {
  if (!Number.isInteger(sura) || sura < 1 || sura > 114 || from < 1 || to < from || to > surahByNumber(sura).ayat) return null
  const fetchFn = deps.fetch ?? fetch
  const v = await currentVersion(fetchFn, deps.now ?? Date.now())
  const key = `${v ?? "0"}:${sura}`
  let rows = surahs.get(key)
  if (!rows) {
    try {
      const res = await fetchFn(`${API}/translation/sura/${QURAN_TRANSLATION.key}/${sura}?v=${encodeURIComponent(v ?? "0")}`, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      rows = ((await res.json()) as { result?: QuranEncVerse[] }).result ?? []
      surahs.set(key, rows)
    } catch (e) {
      logEvent("warn", "quran", `QuranEnc surah ${sura} not read: ${e instanceof Error ? e.message : String(e)} — the post keeps its link`, { fold: true })
      return null
    }
  }
  const out: QuranVerseText[] = []
  for (let aya = from; aya <= to; aya++) {
    const row = rows.find((r) => Number(r.sura) === sura && Number(r.aya) === aya)
    if (!row || !row.translation?.trim()) return null // never a partial quotation
    out.push(verseFromRow(row))
  }
  return out
}

/** One verse: `getQuranVerse(2, 255)` → { arabic, khmer, suraName, suraNumber, ayaNumber, footnotes }. */
export async function getQuranVerse(sura: number, aya: number, deps: { fetch?: Fetch; now?: number } = {}): Promise<QuranVerseText | null> {
  return (await getQuranVerses(sura, aya, aya, deps))?.[0] ?? null
}

/** Tests only: forget what is held. */
export function resetQuranCache() {
  version = null
  surahs.clear()
}
