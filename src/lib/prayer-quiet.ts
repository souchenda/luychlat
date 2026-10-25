/**
 * The SoundBox's quiet minutes after each Adhan (founder, 26/10/2026 — Task #506, Phase 1): an Islamic Mode counter
 * phone that opted in stays silent for 15 (or 20) minutes from each of the five prayers, 40 after Dhuhr on Friday
 * (Jumu'ah), so a sale never speaks over the prayer. Only plain spans leave this module — the SoundBox reads
 * `{ from, to }` (lib/soundbox.ts › readQuietSpans) and never imports prayer code (tests/golden/6-soundbox-isolation).
 * Times as lib/prayer computes them; the minutes are a stated choice, shown in the settings. Pure (prayer-quiet.test.ts).
 */
import { placeNow, prayerTimes, type PrayerKey } from "@/lib/prayer"

export const PRAYER_QUIET_MINUTES = [15, 20] as const
export type PrayerQuietMinutes = (typeof PRAYER_QUIET_MINUTES)[number]
export const DEFAULT_PRAYER_QUIET_MINUTES: PrayerQuietMinutes = 15
/** Friday's Dhuhr is the Jumu'ah: the sermon and the prayer together. */
export const JUMUAH_QUIET_MINUTES = 40

const QUIET_PRAYERS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"]

export type QuietWindow = { prayer: PrayerKey; jumuah: boolean; from: number; to: number }

/** Every quiet window of today and tomorrow at the place (epoch ms), oldest first — a day boundary never leaves a gap. */
export function prayerQuietWindows(o: { now: number; lat: number; lng: number; utcOffset: number; minutes?: number }): QuietWindow[] {
  const minutes = (PRAYER_QUIET_MINUTES as readonly number[]).includes(o.minutes ?? NaN) ? (o.minutes as number) : DEFAULT_PRAYER_QUIET_MINUTES
  const today = placeNow(o.utcOffset, new Date(o.now)).date
  const out: QuietWindow[] = []
  for (const add of [0, 1]) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + add))
    const date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    const midnight = Date.UTC(date.year, date.month - 1, date.day) - o.utcOffset * 3_600_000
    const friday = d.getUTCDay() === 5
    const times = prayerTimes(date, o.lat, o.lng, o.utcOffset)
    for (const prayer of QUIET_PRAYERS) {
      const from = midnight + Math.round(times[prayer] * 60_000)
      const jumuah = friday && prayer === "dhuhr"
      out.push({ prayer, jumuah, from, to: from + (jumuah ? JUMUAH_QUIET_MINUTES : minutes) * 60_000 })
    }
  }
  return out
}
