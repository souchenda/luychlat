import { chineseDay } from "@/lib/chinese-lunar"
import { khmerLunarDate } from "@/lib/khmer-lunar"

/**
 * Khmer and Khmer-Chinese festival & offering days (ថ្ងៃបុណ្យ និងថ្ងៃសែន):
 * the header pill, the Home greeting, the list on /bills and the Telegram
 * greeting (08:00 on a festival's first day) and reminder (18:00 the eve).
 *
 * festival — national / Buddhist festivals and Chinese New Year: greeted.
 * offering — Khmer-Chinese ancestor & deity offerings (ថ្ងៃសែន): reminded the
 *            eve, so families can buy offerings and set a budget.
 */
export type CulturalKey =
  | "new_year"
  | "little_new_year"
  | "cny_eve"
  | "chinese_new_year"
  | "khmer_new_year"
  | "hungry_ghost"
  | "mid_autumn"
  | "pchum_ben"
  | "water_festival"
  | "dongzhi"

export type CulturalDay = {
  key: CulturalKey
  kind: "festival" | "offering"
  /** First and last day, inclusive (YYYY-MM-DD). */
  start: string
  end: string
}

/** Days whose eve gets no reminder: Chinese New Year's eve is its own offering day (cny_eve). */
export const NO_EVE_REMINDER = new Set<CulturalKey>(["chinese_new_year"])

/** Khmer-Chinese families' days, shown in red and gold. */
export const CHINESE_KEYS = new Set<CulturalKey>(["little_new_year", "cny_eve", "chinese_new_year", "hungry_ghost", "mid_autumn", "dongzhi"])

/**
 * Winter solstice (冬至) date in Cambodia / China. A solar term, so listed per
 * year (the solstice instant, checked against published tables, never falls
 * between 17:00 and 23:00 UTC in these years, so UTC+7 and UTC+8 agree).
 */
const DONGZHI: Record<number, string> = {
  2025: "2025-12-21",
  2026: "2026-12-22",
  2027: "2027-12-22",
  2028: "2028-12-21",
  2029: "2029-12-21",
  2030: "2030-12-22",
  2031: "2031-12-22",
  2032: "2032-12-21",
  2033: "2033-12-21",
  2034: "2034-12-22",
  2035: "2035-12-22",
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** Whole days from a to b (YYYY-MM-DD). */
export const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5)

/** The first day in [from, to] with this Khmer lunar month / phase / day ("last" = the month's last day). */
function khmerDay(month: number, phase: "kert" | "roch", day: number | "last", from: string, to: string): string | null {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const l = khmerLunarDate(d)
    const last = phase === "roch" ? l.monthLength - 15 : 15
    if (l.month === month && l.phase === phase && l.day === (day === "last" ? last : day)) return d
  }
  return null
}

const cache = new Map<number, CulturalDay[]>()

/**
 * The days of one Gregorian year, by date.
 * - Pchum Ben: the day before ភ្ជុំ (last day of waning ភទ្របទ), ភ្ជុំ, and the day after;
 *   Water Festival: 14–15 កើត and 1 រោច of កត្តិក. Both match the official holiday
 *   sub-decrees 2022–2027. Khmer New Year: 14–16 April.
 * - Chinese dates (chinese-lunar.ts): 送灶 / ដកជើងធូប 12/24, New Year's eve (the day
 *   before 1/1), New Year 1/1–1/3, 中元 / ក្បាលទឹក 7/15, 中秋 / ព្រះខែ 8/15.
 */
export function culturalDaysOf(year: number): CulturalDay[] {
  const hit = cache.get(year)
  if (hit) return hit
  const list: CulturalDay[] = [{ key: "new_year", kind: "festival", start: `${year}-01-01`, end: `${year}-01-01` }]
  const one = (key: CulturalKey, kind: CulturalDay["kind"], iso: string | null, days = 1) => {
    if (iso) list.push({ key, kind, start: iso, end: addDays(iso, days - 1) })
  }
  one("little_new_year", "offering", chineseDay(12, 24, `${year}-01-01`, `${year}-02-20`))
  const cny = chineseDay(1, 1, `${year}-01-15`, `${year}-02-25`)
  if (cny) {
    one("cny_eve", "offering", addDays(cny, -1))
    one("chinese_new_year", "festival", cny, 3)
  }
  one("khmer_new_year", "festival", `${year}-04-14`, 3)
  one("hungry_ghost", "offering", chineseDay(7, 15, `${year}-07-20`, `${year}-09-20`))
  one("mid_autumn", "offering", chineseDay(8, 15, `${year}-08-20`, `${year}-10-20`))
  const pchum = khmerDay(9, "roch", "last", `${year}-08-15`, `${year}-10-31`)
  if (pchum) one("pchum_ben", "festival", addDays(pchum, -1), 3)
  const water = khmerDay(11, "kert", 15, `${year}-10-15`, `${year}-12-15`)
  if (water) one("water_festival", "festival", addDays(water, -1), 3)
  one("dongzhi", "offering", DONGZHI[year] ?? null)
  list.sort((a, b) => a.start.localeCompare(b.start))
  cache.set(year, list)
  return list
}

/** The day running on `iso`, if any. */
export function culturalDayOn(iso: string): CulturalDay | null {
  return culturalDaysOf(Number(iso.slice(0, 4))).find((d) => iso >= d.start && iso <= d.end) ?? null
}

/** Days starting after `iso` within `withinDays` (this year and next), soonest first. */
export function upcomingCulturalDays(iso: string, withinDays = 365): CulturalDay[] {
  const y = Number(iso.slice(0, 4))
  return [...culturalDaysOf(y), ...culturalDaysOf(y + 1)].filter((d) => d.start > iso && daysUntil(iso, d.start) <= withinDays)
}
