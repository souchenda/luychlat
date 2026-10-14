// Birthdays (pure): today is judged in Cambodia time (a phone set to another time zone must not wish a
// day early or late), 29 February counts on 28 February in other years, and the full-screen
// celebration shows once a year per device.

const ICT_MS = 7 * 3_600_000

/** Today's date in Cambodia: { year, month (1–12), day }. */
export function cambodiaDate(now: number = Date.now()): { year: number; month: number; day: number } {
  const d = new Date(now + ICT_MS)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Is today (Cambodia time) the birthday for this date of birth ("YYYY-MM-DD")? */
export function isBirthdayToday(dob: string | null | undefined, now: number = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "")
  if (!m) return false
  const month = Number(m[2])
  const day = Number(m[3])
  const today = cambodiaDate(now)
  if (month === today.month && day === today.day) return true
  return month === 2 && day === 29 && !isLeap(today.year) && today.month === 2 && today.day === 28
}

/** The once-a-year gate: show the celebration unless it was already shown this (Cambodia) year. */
export const BIRTHDAY_SHOWN_KEY = "birthday_shown_year"
export function shouldCelebrate(dob: string | null | undefined, shownYear: string | null, now: number = Date.now()): boolean {
  return isBirthdayToday(dob, now) && shownYear !== String(cambodiaDate(now).year)
}

/** «Happy Birthday to You» (traditional melody, public domain): [frequency Hz, beats]. */
export const BIRTHDAY_TUNE: [number, number][] = [
  [392, 0.75], [392, 0.25], [440, 1], [392, 1], [523.25, 1], [493.88, 2],
  [392, 0.75], [392, 0.25], [440, 1], [392, 1], [587.33, 1], [523.25, 2],
  [392, 0.75], [392, 0.25], [783.99, 1], [659.25, 1], [523.25, 1], [493.88, 1], [440, 2],
  [698.46, 0.75], [698.46, 0.25], [659.25, 1], [523.25, 1], [587.33, 1], [523.25, 2],
]
