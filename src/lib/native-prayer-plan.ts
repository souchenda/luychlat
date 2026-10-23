/**
 * The native Adhan's plan (founder, 20/10/2026 — the Android app rings the Adhan at each prayer with the screen locked,
 * like Muslim Pro). Pure (native-prayer-plan.test.ts): the next `days` days of the five prayers from `now`, each with a
 * stable id, so a re-plan on every launch replaces the same alarms instead of adding more.
 */
import { ALERT_PRAYERS } from "@/lib/prayer-alerts"
import { cambodiaNow, CAMBODIA_UTC_OFFSET, prayerTimes, type PrayerKey } from "@/lib/prayer"

/** The channels (an Android channel's sound can never change: a new sound is a new id). */
export const NATIVE_CHANNELS = {
  adhan: { id: "prayer_adhan_v1", name: "Prayer Times Adhan", sound: "adhan.mp3", importance: 5 },
  chime: { id: "prayer_chime_v1", name: "Prayer Times", sound: undefined, importance: 4 },
  // «រំញ័រ» (Task #476): from 1.6 the alarm vibrates (AdhanAlarmReceiver); before 1.6 a quiet notification.
  vibrate: { id: "prayer_vibrate_v1", name: "Prayer Times (vibrate)", sound: undefined, importance: 2 },
  silent: { id: "prayer_silent_v1", name: "Prayer Times (silent)", sound: undefined, importance: 2 },
} as const

export type NativeSound = keyof typeof NATIVE_CHANNELS

/** Days planned ahead: the app re-plans at every launch; a phone left alone a week still rings. */
export const NATIVE_DAYS_AHEAD = 7

/** Our alarm ids: yyyymmdd × 10 + the prayer's index (Fajr 0 … Isha 4) — under 2^31, and never another feature's. */
export const nativePrayerId = (date: { year: number; month: number; day: number }, prayer: PrayerKey) =>
  (date.year * 10_000 + date.month * 100 + date.day) * 10 + ALERT_PRAYERS.indexOf(prayer)

export const isNativePrayerId = (id: number) => id >= 200_000_000 && id < 400_000_000 && id % 10 < ALERT_PRAYERS.length

export type NativePrayer = { id: number; prayer: PrayerKey; at: Date; minutes: number; day: { year: number; month: number; day: number } }

/** The prayers still ahead, today first, for `days` days. */
export function nativePrayerPlan(now: Date, lat: number, lng: number, days = NATIVE_DAYS_AHEAD): NativePrayer[] {
  const out: NativePrayer[] = []
  const today = cambodiaNow(now).date
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i))
    const day = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    const times = prayerTimes(day, lat, lng)
    for (const prayer of ALERT_PRAYERS) {
      const minutes = times[prayer]
      const at = new Date(Date.UTC(day.year, day.month - 1, day.day) + (Math.round(minutes) - CAMBODIA_UTC_OFFSET * 60) * 60_000)
      if (at.getTime() > now.getTime()) out.push({ id: nativePrayerId(day, prayer), prayer, at, minutes, day })
    }
  }
  return out
}
