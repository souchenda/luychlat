/**
 * App-wide display standards, in one place:
 *   phone numbers   078 824 222 · 012 345 6789 · +855 78 824 222
 *   time left/late  formatDuration — the ONLY way to show a number of days counting
 *                   to or from a date: "នៅសល់ ១៥ ថ្ងៃ" · "ហួសកំណត់ ៧ ខែ ៦ ថ្ងៃ (២១៨ ថ្ងៃ)" ·
 *                   "នៅសល់ ១០ ឆ្នាំ ៥ ខែ (៣,៨៣៤ ថ្ងៃ)" (app, bot; SQL mirror public.format_duration)
 *   money           formatMoney (lib/money): $1,234.50 · 40,000៛ · masked $***** / *****៛;
 *                   converted amounts carry "≈" (formatApprox)
 * Screens use these instead of formatting by hand.
 */
import type { Currency } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { addDays, addMonths, differenceInCalendarDays, differenceInMonths, parseISO } from "date-fns"

import { todayDate } from "@/lib/debts"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { formatPhoneDisplay } from "@/lib/phone"

/** A number stored as +855… that the person typed the local way: "078 824 222" (debt contacts). */
export { formatPhoneLocal } from "@/lib/phone"

/** Cambodian numbers with spaces (other countries as typed). */
export const formatPhoneNumber = (phone: string | null | undefined) => (phone ? formatPhoneDisplay(phone) : "")

export type DurationKind = "remaining" | "overdue"

const DURATION_WORDS: Record<Locale, Record<DurationKind, string>> = {
  km: { remaining: "នៅសល់", overdue: "ហួសកំណត់" },
  en: { remaining: "left", overdue: "overdue" },
  zh: { remaining: "剩余", overdue: "逾期" },
}

/**
 * A number of days counting to (remaining) or from (overdue) today, the way
 * people say it — the single standard for every screen, card and bot message:
 *   under 30 days   នៅសល់ ១៥ ថ្ងៃ          · 15 days left            · 剩余 15天
 *   30–364 days     ហួសកំណត់ ៧ ខែ ៦ ថ្ងៃ (២១៨ ថ្ងៃ) · 7 mos 6 days overdue (218d) · 逾期 7个月6天 (218天)
 *   365 days +      នៅសល់ ១០ ឆ្នាំ ៥ ខែ (៣,៨៣៤ ថ្ងៃ) · 10 yrs 5 mos left (3,834d) · 剩余 10年5个月 (3,834天)
 * Months and years are calendar ones, counted from today. Khmer: Khmer digits
 * throughout. "Due today" (0 days) is the caller's own wording.
 */
export function formatDuration(days: number, kind: DurationKind, locale: Locale, today: string = todayDate()): string {
  const total = Math.abs(Math.round(days))
  const word = DURATION_WORDS[locale][kind]
  const now = parseISO(today)
  const [from, to] = kind === "remaining" ? [now, addDays(now, total)] : [addDays(now, -total), now]
  const allMonths = differenceInMonths(to, from)
  const years = Math.floor(allMonths / 12)
  const months = allMonths % 12
  const rest = differenceInCalendarDays(to, addMonths(from, allMonths))
  const sum = total.toLocaleString("en-US")
  let text: string
  if (locale === "km") {
    const parts = total < 30 ? `${total} ថ្ងៃ` : years > 0 ? `${years} ឆ្នាំ${months ? ` ${months} ខែ` : ""}` : `${months} ខែ${rest ? ` ${rest} ថ្ងៃ` : ""}`
    text = `${word} ${parts}${total < 30 ? "" : ` (${sum} ថ្ងៃ)`}`
    return khmerDigits(text)
  }
  if (locale === "zh") {
    const parts = total < 30 ? `${total}天` : years > 0 ? `${years}年${months ? `${months}个月` : ""}` : `${months}个月${rest ? `${rest}天` : ""}`
    return `${word} ${parts}${total < 30 ? "" : ` (${sum}天)`}`
  }
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`
  const parts =
    total < 30
      ? n(total, "day", "days")
      : years > 0
        ? `${n(years, "yr", "yrs")}${months ? ` ${n(months, "mo", "mos")}` : ""}`
        : `${n(months, "mo", "mos")}${rest ? ` ${n(rest, "day", "days")}` : ""}`
  return `${parts} ${word}${total < 30 ? "" : ` (${sum}d)`}`
}

/** Days from today to a yyyy-mm-dd date (negative when past), or null. */
export const daysUntil = (date: string | null | undefined, today: string = todayDate()) =>
  date ? differenceInCalendarDays(parseISO(date), parseISO(today)) : null

/** "Overdue …" for a due date in the past (formatDuration); empty when not overdue. */
export function formatOverdue(dueDate: string | null | undefined, locale: Locale, today: string = todayDate()): string {
  const days = daysUntil(dueDate, today)
  return days !== null && days < 0 ? formatDuration(-days, "overdue", locale, today) : ""
}

/** "… left" until a due date in the future (formatDuration); empty when due today or past. */
export function formatRemaining(dueDate: string | null | undefined, locale: Locale, today: string = todayDate()): string {
  const days = daysUntil(dueDate, today)
  return days !== null && days > 0 ? formatDuration(days, "remaining", locale, today) : ""
}

/** A converted amount, always marked as approximate: "≈ 2,060,000៛". */
export const formatApprox = (amount: number, currency: Currency, hidden = false) => `≈ ${formatMoney(amount, currency, { hidden })}`

/** "3860 0123 6262" → "386***6262" (digits only; short numbers as they are). */
export function maskAccount(account: string | null | undefined): string {
  const digits = (account ?? "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.length >= 8 ? `${digits.slice(0, 3)}***${digits.slice(-4)}` : digits
}
