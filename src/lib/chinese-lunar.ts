/**
 * Chinese lunar dates (for the Khmer-Chinese offering days).
 *
 * Month numbering (and leap months) comes from the platform's Chinese calendar
 * (Intl, `ca-chinese`). Its new-moon maths is approximate, though, and slips
 * a day when the new moon falls near midnight in Beijing (it puts Chinese New
 * Year 2027 on 7 Feb and 2030 on 2 Feb; the real dates are 6 Feb and 3 Feb).
 * So the first day of a month is taken from a precise new moon (Meeus,
 * Astronomical Algorithms ch. 49, accurate to well under a minute) in Beijing
 * time (UTC+8), as the Chinese calendar defines it.
 */

const DAY = 864e5
const rad = Math.PI / 180

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)

let formatter: Intl.DateTimeFormat | null | undefined
function chineseFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-chinese", { timeZone: "UTC", month: "numeric", day: "numeric" })
    formatter = f.resolvedOptions().calendar === "chinese" ? f : null
  } catch {
    formatter = null
  }
  return formatter
}

/** The platform's Chinese month / day for a date; null where the calendar isn't available. */
function approxChinese(iso: string): { month: number; leap: boolean; day: number } | null {
  const f = chineseFormatter()
  if (!f) return null
  const parts = Object.fromEntries(f.formatToParts(new Date(`${iso}T12:00:00Z`)).map((p) => [p.type, p.value]))
  const month = parseInt(parts.month, 10)
  const day = parseInt(parts.day, 10)
  if (!month || !day) return null
  return { month, leap: /bis|leap/i.test(parts.month), day }
}

/** Julian Ephemeris Day of new moon number k (k = 0 near 6 Jan 2000). */
function newMoonJde(k: number): number {
  const T = k / 1236.85
  const E = 1 - 0.002516 * T - 0.0000074 * T * T
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T ** 3) * rad
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4) * rad
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4) * rad
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3) * rad
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4
  const s = Math.sin
  jde +=
    -0.4072 * s(Mp) +
    0.17241 * E * s(M) +
    0.01608 * s(2 * Mp) +
    0.01039 * s(2 * F) +
    0.00739 * E * s(Mp - M) -
    0.00514 * E * s(Mp + M) +
    0.00208 * E * E * s(2 * M) -
    0.00111 * s(Mp - 2 * F) -
    0.00057 * s(Mp + 2 * F) +
    0.00056 * E * s(2 * Mp + M) -
    0.00042 * s(3 * Mp) +
    0.00042 * E * s(M + 2 * F) +
    0.00038 * E * s(M - 2 * F) -
    0.00024 * E * s(2 * Mp - M) -
    0.00017 * s(O) -
    0.00007 * s(Mp + 2 * M) +
    0.00004 * s(2 * Mp - 2 * F) +
    0.00004 * s(3 * M) +
    0.00003 * s(Mp + M - 2 * F) +
    0.00003 * s(2 * Mp + 2 * F) -
    0.00003 * s(Mp + M + 2 * F) +
    0.00003 * s(Mp - M + 2 * F) -
    0.00002 * s(Mp - M - 2 * F) -
    0.00002 * s(3 * Mp + M) +
    0.00002 * s(4 * Mp)
  // Planetary arguments.
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T * T, 0.000325],
    [251.88 + 0.016321 * k, 0.000165],
    [251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126],
    [84.66 + 18.206239 * k, 0.00011],
    [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.00006],
    [154.84 + 7.30686 * k, 0.000056],
    [34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042],
    [291.34 + 1.844379 * k, 0.00004],
    [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035],
    [331.55 + 3.592518 * k, 0.000023],
  ]
  for (const [arg, c] of A) jde += c * s(arg * rad)
  return jde
}

/** UTC time (ms) of the new moon nearest to a date. */
export function newMoonNear(iso: string): number {
  const year = Date.parse(`${iso}T00:00:00Z`) / (365.2425 * DAY) + 1970
  const k = Math.round((year - 2000) * 12.3685)
  let best = Infinity
  let when = 0
  for (let i = k - 1; i <= k + 1; i++) {
    // JDE (TT) → UTC: ΔT ≈ 70 s in the 2020s–2030s.
    const ms = (newMoonJde(i) - 2440587.5) * DAY - 70_000
    const d = Math.abs(ms - Date.parse(`${iso}T12:00:00Z`))
    if (d < best) {
      best = d
      when = ms
    }
  }
  return when
}

/** The Beijing calendar date (YYYY-MM-DD) of a UTC instant. */
const beijingDate = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)

/**
 * The Gregorian date of Chinese month `month` (not a leap month), day `day`,
 * searching [from, to]. Null when the platform has no Chinese calendar.
 */
export function chineseDay(month: number, day: number, from: string, to: string): string | null {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const c = approxChinese(d)
    if (!c) return null
    if (c.month !== month || c.leap) continue
    // The platform's first day of this month, then the true one from the precise new moon.
    const approxFirst = addDays(d, 1 - c.day)
    const first = beijingDate(newMoonNear(approxFirst))
    return addDays(first, day - 1)
  }
  return null
}
