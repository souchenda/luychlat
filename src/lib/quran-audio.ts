/**
 * Quran recitation, streamed (founder, 18/10/2026): Mishary Rashid Alafasy, Hafs ʿan ʿAsim, Murattal — from
 * MP3Quran.net's official public CDN (listed by its API: mp3quran.net/api/v3/reciters?reciter=123, all 114
 * surahs). Nothing is stored on our server; the browser streams from the CDN (allowed in the CSP media-src
 * for that host only). Pure (quran-audio.test.ts).
 */

export const QURAN_AUDIO_HOST = "https://cdn.mp3quran.net"

export const QURAN_RECITER = {
  name: "Mishary Rashid Alafasy",
  riwaya: "Hafs ʿan ʿAsim · Murattal",
  source: "MP3Quran.net",
  sourceUrl: "https://mp3quran.net",
} as const

/** «https://cdn.mp3quran.net/audio/mishary-alafasy/r1/001.mp3» for surah 1. */
export function quranAudioUrl(surah: number): string {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error(`no surah ${surah}`)
  return `${QURAN_AUDIO_HOST}/audio/mishary-alafasy/r1/${String(surah).padStart(3, "0")}.mp3`
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
