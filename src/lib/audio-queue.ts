/**
 * The in-app audio player's queue (Quran recitation and cleared Qasidah / Nasheed recordings — one player
 * for both, founder, 18/10/2026). Pure (audio-queue.test.ts).
 */
import type { SleepTimer } from "@/lib/quran-audio"

export type AudioKind = "quran" | "nasheed"

export type Track = {
  /** Unique within its kind: «quran:18», «nasheed:<id>». */
  key: string
  title: string
  /** The reciter or artist. */
  subtitle: string
  /** An Arabic title shown beside (surah names). */
  arabic?: string
  src: string
}

/** When a track ends: the next one in the queue — unless the timer said «at the end of this track», or it was the last. */
export function afterTrack(index: number, length: number, sleep: SleepTimer): number | null {
  if (sleep?.kind === "surah" || index + 1 >= length) return null
  return index + 1
}

/** ⏮︎ / ⏭︎: the neighbour in the queue, or null at either end. */
export function neighbour(index: number, length: number, step: -1 | 1): number | null {
  const next = index + step
  return next >= 0 && next < length ? next : null
}
