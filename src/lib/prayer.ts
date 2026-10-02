/**
 * Daily prayer times and the Qibla direction, calculated on the device (no
 * network, the location never leaves the phone).
 *
 * Method (the convention used in Cambodia and its neighbours, as in the
 * Malaysian/Singapore calendars): Fajr at 20° below the horizon, Isha at 18°,
 * Asr when a shadow equals its object plus the noon shadow (Shafiʻi), and a
 * 2-minute safety margin (ihtiyat). Times are local Cambodia time (UTC+7).
 * Astronomy follows the public-domain PrayTimes.org formulas.
 */

export type PrayerKey = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha"
export const PRAYER_ORDER: PrayerKey[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
/** Minutes after local midnight, Cambodia time. */
export type PrayerTimes = Record<PrayerKey, number>

export const CAMBODIA_UTC_OFFSET = 7
const FAJR_ANGLE = 20
const ISHA_ANGLE = 18
const ASR_FACTOR = 1
const IHTIYAT_MINUTES = 2
const KAABA = { lat: 21.4225, lng: 39.8262 }

/** Province capitals (approximate coordinates are plenty for prayer times). */
export const PROVINCES: { key: string; km: string; en: string; lat: number; lng: number }[] = [
  { key: "phnom_penh", km: "ភ្នំពេញ", en: "Phnom Penh", lat: 11.5564, lng: 104.9282 },
  { key: "banteay_meanchey", km: "បន្ទាយមានជ័យ", en: "Banteay Meanchey", lat: 13.5859, lng: 102.9737 },
  { key: "battambang", km: "បាត់ដំបង", en: "Battambang", lat: 13.0957, lng: 103.2022 },
  { key: "kampong_cham", km: "កំពង់ចាម", en: "Kampong Cham", lat: 11.9934, lng: 105.4635 },
  { key: "kampong_chhnang", km: "កំពង់ឆ្នាំង", en: "Kampong Chhnang", lat: 12.2505, lng: 104.6666 },
  { key: "kampong_speu", km: "កំពង់ស្ពឺ", en: "Kampong Speu", lat: 11.4533, lng: 104.5209 },
  { key: "kampong_thom", km: "កំពង់ធំ", en: "Kampong Thom", lat: 12.7111, lng: 104.8887 },
  { key: "kampot", km: "កំពត", en: "Kampot", lat: 10.6104, lng: 104.1815 },
  { key: "kandal", km: "កណ្ដាល", en: "Kandal", lat: 11.4833, lng: 104.95 },
  { key: "kep", km: "កែប", en: "Kep", lat: 10.4829, lng: 104.3167 },
  { key: "koh_kong", km: "កោះកុង", en: "Koh Kong", lat: 11.6153, lng: 102.9838 },
  { key: "kratie", km: "ក្រចេះ", en: "Kratie", lat: 12.4881, lng: 106.0188 },
  { key: "mondulkiri", km: "មណ្ឌលគិរី", en: "Mondulkiri", lat: 12.4558, lng: 107.1881 },
  { key: "oddar_meanchey", km: "ឧត្ដរមានជ័យ", en: "Oddar Meanchey", lat: 14.1818, lng: 103.5176 },
  { key: "pailin", km: "ប៉ៃលិន", en: "Pailin", lat: 12.8489, lng: 102.6093 },
  { key: "preah_sihanouk", km: "ព្រះសីហនុ", en: "Preah Sihanouk", lat: 10.6253, lng: 103.5234 },
  { key: "preah_vihear", km: "ព្រះវិហារ", en: "Preah Vihear", lat: 13.8077, lng: 104.9806 },
  { key: "prey_veng", km: "ព្រៃវែង", en: "Prey Veng", lat: 11.4868, lng: 105.3253 },
  { key: "pursat", km: "ពោធិ៍សាត់", en: "Pursat", lat: 12.5388, lng: 103.9192 },
  { key: "ratanakiri", km: "រតនគិរី", en: "Ratanakiri", lat: 13.7394, lng: 106.9873 },
  { key: "siem_reap", km: "សៀមរាប", en: "Siem Reap", lat: 13.3633, lng: 103.8564 },
  { key: "stung_treng", km: "ស្ទឹងត្រែង", en: "Stung Treng", lat: 13.5259, lng: 105.9683 },
  { key: "svay_rieng", km: "ស្វាយរៀង", en: "Svay Rieng", lat: 11.0878, lng: 105.7993 },
  { key: "takeo", km: "តាកែវ", en: "Takeo", lat: 10.9908, lng: 104.7849 },
  { key: "tbong_khmum", km: "ត្បូងឃ្មុំ", en: "Tbong Khmum", lat: 11.907, lng: 105.656 },
]

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const fix = (a: number, b: number) => {
  const v = a - b * Math.floor(a / b)
  return v < 0 ? v + b : v
}

function julian(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const a = Math.floor(year / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5
}

function sunPosition(jd: number): { declination: number; equation: number } {
  const d = jd - 2451545.0
  const g = fix(357.529 + 0.98560028 * d, 360)
  const q = fix(280.459 + 0.98564736 * d, 360)
  const l = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360)
  const e = 23.439 - 0.00000036 * d
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15
  return { declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))), equation: q / 15 - fix(ra, 24) }
}

/**
 * Prayer times for a calendar date at a place, as minutes after midnight
 * (Cambodia time). `date` supplies only year/month/day.
 */
export function prayerTimes(date: { year: number; month: number; day: number }, lat: number, lng: number, utcOffset = CAMBODIA_UTC_OFFSET): PrayerTimes {
  const jd = julian(date.year, date.month, date.day) - lng / (15 * 24)
  const noon = (t: number) => fix(12 - sunPosition(jd + t).equation, 24)
  // Hours from noon until the sun is `angle` degrees below the horizon (negative angle = above).
  const fromNoon = (angle: number, t: number) => {
    const decl = sunPosition(jd + t).declination
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)))
    return deg(Math.acos(Math.min(1, Math.max(-1, cos)))) / 15
  }
  const asrAngle = (t: number) => {
    const decl = sunPosition(jd + t).declination
    return -deg(Math.atan(1 / (ASR_FACTOR + Math.tan(rad(Math.abs(lat - decl))))))
  }
  const riseSet = 0.833

  const hours: PrayerTimes = {
    fajr: noon(5 / 24) - fromNoon(FAJR_ANGLE, 5 / 24),
    sunrise: noon(6 / 24) - fromNoon(riseSet, 6 / 24),
    dhuhr: noon(12 / 24),
    asr: noon(13 / 24) + fromNoon(asrAngle(13 / 24), 13 / 24),
    maghrib: noon(18 / 24) + fromNoon(riseSet, 18 / 24),
    isha: noon(18 / 24) + fromNoon(ISHA_ANGLE, 18 / 24),
  }
  const shift = utcOffset - lng / 15
  const out = {} as PrayerTimes
  for (const key of PRAYER_ORDER) {
    const margin = key === "sunrise" ? -IHTIYAT_MINUTES : IHTIYAT_MINUTES
    out[key] = Math.round((hours[key] + shift) * 60) + margin
  }
  return out
}

/** "04:33" from minutes after midnight. */
export function formatMinutes(minutes: number): string {
  const m = fix(Math.round(minutes), 24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Today's date and the current minute in Cambodia, whatever the device's time zone. */
export function cambodiaNow(now = new Date()): { date: { year: number; month: number; day: number }; minutes: number; seconds: number } {
  const shifted = new Date(now.getTime() + CAMBODIA_UTC_OFFSET * 3600_000)
  return {
    date: { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() },
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
  }
}

/** The next of the five prayers (sunrise is not a prayer) and seconds until it; after Isha, tomorrow's Fajr. */
export function nextPrayer(today: PrayerTimes, tomorrow: PrayerTimes, minutes: number, seconds = 0): { key: PrayerKey; inSeconds: number } {
  const nowSec = minutes * 60 + seconds
  for (const key of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) {
    if (today[key] * 60 > nowSec) return { key, inSeconds: today[key] * 60 - nowSec }
  }
  return { key: "fajr", inSeconds: 24 * 3600 - nowSec + tomorrow.fajr * 60 }
}

/** Compass bearing to the Kaaba in degrees from true north (clockwise). */
export function qiblaBearing(lat: number, lng: number): number {
  const φ1 = rad(lat)
  const φ2 = rad(KAABA.lat)
  const Δλ = rad(KAABA.lng - lng)
  const θ = Math.atan2(Math.sin(Δλ), Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ))
  return fix(deg(θ), 360)
}

/** Great-circle distance in km (for sorting places by distance). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dφ = rad(b.lat - a.lat)
  const dλ = rad(b.lng - a.lng)
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dλ / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
