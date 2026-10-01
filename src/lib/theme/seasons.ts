import type { MessageKey } from "@/lib/i18n/dictionaries"

/**
 * Seasonal themes. The active one is set as <html data-season="…">; the
 * colours live in globals.css. Only the brand colour changes (buttons, active
 * tab, balance card, header line); income stays green and expenses rose in
 * every theme, so money colours never change meaning.
 */
export type SeasonKey = "default" | "khmer_new_year" | "pchum_ben" | "water_festival" | "christmas" | "chinese_new_year"
export type ThemeChoice = "auto" | SeasonKey

export const SEASONS: { key: SeasonKey; name: MessageKey; swatch: [string, string] }[] = [
  { key: "default", name: "season.default", swatch: ["#10B981", "#334155"] },
  { key: "khmer_new_year", name: "season.khmer_new_year", swatch: ["#F59E0B", "#EA580C"] },
  { key: "pchum_ben", name: "season.pchum_ben", swatch: ["#D97706", "#059669"] },
  { key: "water_festival", name: "season.water_festival", swatch: ["#06B6D4", "#2563EB"] },
  { key: "christmas", name: "season.christmas", swatch: ["#E11D48", "#15803D"] },
  { key: "chinese_new_year", name: "season.chinese_new_year", swatch: ["#DC2626", "#F59E0B"] },
]

/**
 * Festive periods by calendar date (MM-DD, inclusive). Khmer New Year is
 * mid-April; the lunar festivals move every year, so their windows are wide
 * enough to cover the actual days in recent and coming years.
 */
export const SEASON_WINDOWS: [SeasonKey, string, string][] = [
  ["chinese_new_year", "01-20", "02-25"],
  ["khmer_new_year", "04-01", "04-20"],
  ["pchum_ben", "09-15", "10-20"],
  ["water_festival", "11-01", "11-30"],
  ["christmas", "12-01", "12-31"],
]

/** Season whose window contains `md` ("MM-DD"), or null. Self-contained: also inlined into the boot script. */
export function pickSeason(windows: [string, string, string][], md: string): string | null {
  for (const w of windows) if (md >= w[1] && md <= w[2]) return w[0]
  return null
}

export const monthDay = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** The festive period `date` falls in, if any (drives "Auto" and the greeting). */
export const seasonOn = (date = new Date()) => pickSeason(SEASON_WINDOWS, monthDay(date)) as SeasonKey | null

export const resolveSeason = (choice: ThemeChoice, date = new Date()): SeasonKey =>
  choice === "auto" ? (seasonOn(date) ?? "default") : choice

/**
 * Runs before the page paints (inlined in <head>) so the right colours show
 * without a flash. Reads the saved choice from the persisted prefs store.
 */
export function bootSeason(windows: [string, string, string][], pick: typeof pickSeason) {
  try {
    const raw = localStorage.getItem("luysmart-prefs")
    const choice = (raw && JSON.parse(raw).state?.colorTheme) || "auto"
    const now = new Date()
    const md = ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2)
    document.documentElement.dataset.season = choice === "auto" ? pick(windows, md) || "default" : choice
  } catch {
    document.documentElement.dataset.season = "default"
  }
}

export const bootSeasonScript = `(${bootSeason.toString()})(${JSON.stringify(SEASON_WINDOWS)}, ${pickSeason.toString()})`
