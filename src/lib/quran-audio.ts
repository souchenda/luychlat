/**
 * Quran recitation, streamed (founder, 18/10/2026): Hafs ʿan ʿAsim, Murattal — from MP3Quran.net's official public
 * CDN, all 114 surahs per reciter (its API: mp3quran.net/api/v3/reciters). Nothing is stored on our server; the
 * browser streams from the CDN (allowed in the CSP media-src for that host only — the CDN's own URLs, never the
 * serverNN.mp3quran.net ones that only redirect to it). The three Imams of Masjid al-Haram first (founder,
 * 19/10/2026), then Mishary Alafasy. Pure (quran-audio.test.ts).
 */

export const QURAN_AUDIO_HOST = "https://cdn.mp3quran.net"
export const QURAN_SOURCE = { name: "MP3Quran.net", url: "https://mp3quran.net", riwaya: "Hafs ʿan ʿAsim · Murattal" } as const

export type ReciterId = "sudais" | "muaiqly" | "dosari" | "alafasy"
export type QuranReciter = { id: ReciterId; name: string; ar: string; km: string; folder: string; apiId: number }

/** The reciters (MP3Quran's API ids and CDN folders, checked 19/10/2026: 114 surahs each, Hafs · Murattal). */
export const QURAN_RECITERS: QuranReciter[] = [
  { id: "sudais", name: "Abdul Rahman Al-Sudais", ar: "عبد الرحمن السديس", km: "🎙️ អាប់ឌុល រ៉ោះម៉ាន អាល់ស៊ូដេស (Al-Sudais)", folder: "abdulrahman-sudais", apiId: 54 },
  { id: "muaiqly", name: "Maher Al-Muaiqly", ar: "ماهر المعيقلي", km: "🎙️ មាហៀរ អាល់មូអៃគ្លី (Maher Al-Muaiqly)", folder: "maher-muaiqly", apiId: 102 },
  { id: "dosari", name: "Yasser Al-Dosari", ar: "ياسر الدوسري", km: "🎙️ យ៉ាសៀរ អាល់ដាវសារី (Yasir Al-Dawsari)", folder: "yasser-dosari", apiId: 92 },
  { id: "alafasy", name: "Mishary Rashid Alafasy", ar: "مشاري راشد العفاسي", km: "🎙️ មីសារី រ៉ាស៊ីដ អាល់អាហ្វាស៊ី (Alafasy)", folder: "mishary-alafasy", apiId: 123 },
]

/** The reciter before the person chooses one (the app's first, unchanged). */
export const DEFAULT_RECITER: ReciterId = "alafasy"
export const reciterOf = (id: string | null | undefined): QuranReciter => QURAN_RECITERS.find((r) => r.id === id) ?? QURAN_RECITERS.find((r) => r.id === DEFAULT_RECITER)!

/** The default reciter with the source — the credit line's words. */
export const QURAN_RECITER = { name: reciterOf(DEFAULT_RECITER).name, riwaya: QURAN_SOURCE.riwaya, source: QURAN_SOURCE.name, sourceUrl: QURAN_SOURCE.url } as const

/** «https://cdn.mp3quran.net/audio/abdulrahman-sudais/r1/001.mp3» for surah 1 by Al-Sudais. */
export function quranAudioUrl(surah: number, reciter: string = DEFAULT_RECITER): string {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error(`no surah ${surah}`)
  return `${QURAN_AUDIO_HOST}/audio/${reciterOf(reciter).folder}/r1/${String(surah).padStart(3, "0")}.mp3`
}

/** The sleep timer: off, after 15 / 30 / 60 minutes, or at the end of this surah. */
export type SleepTimer = null | { kind: "minutes"; until: number } | { kind: "surah" }
export const SLEEP_MINUTES = [15, 30, 60] as const

export const sleepAfter = (minutes: number, now: number): SleepTimer => ({ kind: "minutes", until: now + minutes * 60_000 })

/** Has the sleep timer run out? */
export const sleepDue = (sleep: SleepTimer, now: number) => sleep?.kind === "minutes" && now >= sleep.until

/** When a surah ends: the next one plays on — unless the timer said «at the end of this surah», or it was the last. */
export function afterSurah(surah: number, sleep: SleepTimer): number | null {
  if (sleep?.kind === "surah" || surah >= 114) return null
  return surah + 1
}

/** «12:34» / «1:02:03» for the scrubber. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}
