/**
 * The /islamic home (founder, 19/10/2026): a hero with the next prayer and, on a fast day, Imsak and the Iftar
 * countdown; four quick actions; and the du'a that fits the hour — the same rhythm as the Islamic channel
 * (05:30 waking, 17:30 iftar on Monday / Thursday and in Ramadan, 21:00 bedtime). Pure (islamic-hub.test.ts).
 */
import { isFastDay } from "@/lib/islamic-channel"
import type { HijriDate } from "@/lib/islamic"
import { imsakTime, nextFastingEvent, nextPrayer, type PrayerKey, type PrayerTimes } from "@/lib/prayer"

/** «00:58:45» */
export function countdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":")
}

/** The window around Maghrib when the fast-breaking du'a is the one to show. */
export const IFTAR_WINDOW_BEFORE = 60
export const IFTAR_WINDOW_AFTER = 45

export type HubDuaId = "wake" | "iftar" | "sleep" | "halal-provision"

/**
 * The du'a for this minute:
 *   • around Maghrib on a fast day (an hour before to 45 min after) → breaking the fast;
 *   • from Isha until an hour before Fajr → before sleeping;
 *   • from an hour before Fajr until Dhuhr → on waking;
 *   • the working day in between → for halal provision (the app's own daily life: earning and spending).
 */
export function contextualDua(o: { minutes: number; times: PrayerTimes; fastDay: boolean }): HubDuaId {
  const { minutes: m, times, fastDay } = o
  if (fastDay && m >= times.maghrib - IFTAR_WINDOW_BEFORE && m < times.maghrib + IFTAR_WINDOW_AFTER) return "iftar"
  if (m >= times.isha || m < times.fajr - 60) return "sleep"
  if (m < times.dhuhr) return "wake"
  return "halal-provision"
}

export type HubHero = {
  next: { key: PrayerKey; at: number; inSeconds: number }
  /** Only on a fast day (Ramadan, or Monday / Thursday when fasting is allowed). */
  fast: { imsak: number; iftar: number; iftarInSeconds: number | null } | null
}

/** The hero's numbers. `day` is the Cambodian date «YYYY-MM-DD»; `hijri` today's Hijri date (null → no fast badge). */
export function hubHero(o: { day: string; hijri: HijriDate | null; today: PrayerTimes; tomorrow: PrayerTimes; minutes: number; seconds: number }): HubHero {
  const n = nextPrayer(o.today, o.tomorrow, o.minutes, o.seconds)
  const afterIsha = o.minutes * 60 + o.seconds >= o.today.isha * 60
  const fasting = isFastDay(o.day, o.hijri)
  const event = nextFastingEvent(o.today, o.tomorrow, o.minutes, o.seconds)
  return {
    next: { key: n.key, at: afterIsha ? o.tomorrow.fajr : o.today[n.key], inSeconds: n.inSeconds },
    fast: fasting ? { imsak: imsakTime(o.today), iftar: o.today.maghrib, iftarInSeconds: event.kind === "iftar" ? event.inSeconds : null } : null,
  }
}
