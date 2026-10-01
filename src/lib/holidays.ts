import type { MessageKey } from "@/lib/i18n/dictionaries"

/**
 * Festive periods for the one-line holiday greeting on Home (MM-DD,
 * inclusive). Khmer New Year is mid-April; the lunar festivals move every
 * year, so their windows are wide enough to cover the actual days.
 */
const HOLIDAYS: [MessageKey, string, string][] = [
  ["holiday.chinese_new_year", "01-20", "02-25"],
  ["holiday.khmer_new_year", "04-01", "04-20"],
  ["holiday.pchum_ben", "09-15", "10-20"],
  ["holiday.water_festival", "11-01", "11-30"],
  ["holiday.christmas", "12-01", "12-31"],
]

/** Greeting for the festive period `date` falls in, if any. */
export function holidayGreeting(date = new Date()): MessageKey | null {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  return HOLIDAYS.find(([, from, to]) => md >= from && md <= to)?.[0] ?? null
}
