/**
 * Islamic finance helpers: Hijri dates, festival greetings, Zakat al-Mal and
 * the hawl (lunar year). Pure functions, covered by tests. The figures follow
 * common guidelines; scholars differ on details (which assets count, gold vs
 * silver Nisab), so the UI always shows a "consult a local scholar" note.
 */

export const NISAB_GOLD_GRAMS = 85
export const NISAB_SILVER_GRAMS = 595
export const ZAKAT_RATE = 0.025
/** A lunar (hawl) year. */
export const HAWL_DAYS = 354

/** Preset keys created when the tools are turned on (see set_islamic_tools). */
export const ISLAMIC_CATEGORY_KEYS = ["zakat", "sadaqah", "waqf", "riba_purification", "bank_interest"] as const
export type IslamicCategoryKey = (typeof ISLAMIC_CATEGORY_KEYS)[number]

// --- Hijri calendar ----------------------------------------------------------------

export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabiʻ al-Awwal",
  "Rabiʻ al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Shaʻban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qaʻdah",
  "Dhu al-Hijjah",
]

export type HijriDate = { day: number; month: number; year: number }

let formatter: Intl.DateTimeFormat | null | undefined
function hijriFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" })
    formatter = f.resolvedOptions().calendar.startsWith("islamic") ? f : null
  } catch {
    formatter = null
  }
  return formatter
}

/**
 * Umm al-Qura date, shifted by `offsetDays` (−2…+2) so the admin can follow
 * the local moon-sighting announcement. Null if the browser lacks the calendar.
 */
export function toHijri(date: Date, offsetDays = 0): HijriDate | null {
  const f = hijriFormatter()
  if (!f) return null
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays, 12)
  const parts = Object.fromEntries(f.formatToParts(shifted).map((p) => [p.type, p.value]))
  const day = Number(parts.day)
  const month = Number(parts.month)
  const year = Number(parts.year)
  return Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year) ? { day, month, year } : null
}

const khmerDigits = (value: string) => value.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** "21 Rabiʻ al-Thani 1448 H" (Khmer numerals in Khmer). */
export function formatHijri(h: HijriDate, locale: "km" | "en"): string {
  const text = `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} H`
  return locale === "km" ? khmerDigits(text) : text
}

export type IslamicGreeting = "islamic.ramadan" | "islamic.eidFitr" | "islamic.eidAdha" | null

/** Ramadan (month 9), Eid al-Fitr (1–3 Shawwal), Eid al-Adha (10–13 Dhu al-Hijjah). */
export function islamicGreeting(h: HijriDate | null): IslamicGreeting {
  if (!h) return null
  if (h.month === 9) return "islamic.ramadan"
  if (h.month === 10 && h.day <= 3) return "islamic.eidFitr"
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return "islamic.eidAdha"
  return null
}

// --- Zakat al-Mal --------------------------------------------------------------------

export type ZakatInput = {
  /** Cash and bank balances, in USD. */
  cash: number
  goldGrams: number
  /** USD per gram. */
  goldPrice: number | null
  silverPrice: number | null
  basis: "GOLD" | "SILVER"
  /** Money owed to the user that they expect back (optional), in USD. */
  receivables: number
  /** Debts due within 12 months, in USD. */
  shortTermDebts: number
}

export type ZakatResult = {
  goldValue: number
  /** cash + gold + receivables − short-term debts */
  netWealth: number
  /** null when the price needed for the chosen basis is missing. */
  nisab: number | null
  meetsNisab: boolean
  /** 2.5 % of net wealth when it meets Nisab, else 0. */
  zakat: number
}

const cents = (n: number) => Math.round(n * 100) / 100

export function calculateZakat(i: ZakatInput): ZakatResult {
  const goldValue = i.goldPrice ? i.goldGrams * i.goldPrice : 0
  const netWealth = cents(i.cash + goldValue + i.receivables - i.shortTermDebts)
  const price = i.basis === "GOLD" ? i.goldPrice : i.silverPrice
  const nisab = price ? cents((i.basis === "GOLD" ? NISAB_GOLD_GRAMS : NISAB_SILVER_GRAMS) * price) : null
  const meetsNisab = nisab !== null && netWealth > 0 && netWealth >= nisab
  return { goldValue: cents(goldValue), netWealth, nisab, meetsNisab, zakat: meetsNisab ? cents(netWealth * ZAKAT_RATE) : 0 }
}

// --- Hawl -------------------------------------------------------------------------------

const DAY = 86_400_000
const atNoon = (ymd: string) => new Date(`${ymd}T12:00:00`)
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export type HawlStatus = { start: string; due: string; daysLeft: number; progress: number; isDue: boolean }

/** The current hawl from its start date: due 354 days later. */
export function hawlStatus(start: string, today: Date = new Date()): HawlStatus {
  const s = atNoon(start)
  const due = new Date(s.getTime() + HAWL_DAYS * DAY)
  const now = atNoon(toYmd(today))
  const daysLeft = Math.round((due.getTime() - now.getTime()) / DAY)
  const elapsed = HAWL_DAYS - daysLeft
  return {
    start,
    due: toYmd(due),
    daysLeft,
    progress: Math.min(1, Math.max(0, elapsed / HAWL_DAYS)),
    isDue: daysLeft <= 0,
  }
}

/** Purification balance: interest received minus what was already given away. */
export function purificationBalance(interestReceived: number, purified: number): number {
  return Math.max(0, cents(interestReceived - purified))
}
