/**
 * App-wide display standards, in one place:
 *   phone numbers   078 824 222 · 012 345 6789 · +855 78 824 222
 *   overdue time    ហួសកំណត់ ៧ ខែ ៦ ថ្ងៃ (២១៨ ថ្ងៃ) · Overdue 7 mos 6 days (218d) · 逾期 7个月6天 (218天)
 *   money           formatMoney (lib/money): $1,234.50 · 40,000៛ · masked $***** / *****៛;
 *                   converted amounts carry "≈" (formatApprox)
 * Screens use these instead of formatting by hand.
 */
import type { Currency } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { overdueSpan } from "@/lib/debts"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { formatPhoneDisplay } from "@/lib/phone"

/** A number stored as +855… that the person typed the local way: "078 824 222" (debt contacts). */
export { formatPhoneLocal } from "@/lib/phone"

/** Cambodian numbers with spaces (other countries as typed). */
export const formatPhoneNumber = (phone: string | null | undefined) => (phone ? formatPhoneDisplay(phone) : "")

type T = (key: MessageKey, params?: Record<string, string | number>) => string

/**
 * "Overdue …" for a due date (yyyy-mm-dd) in the past: whole days under 30,
 * months + days (+ the total) from 30 on. Khmer uses Khmer digits. Empty when
 * not overdue.
 */
export function formatOverdue(t: T, dueDate: string | null | undefined, locale: Locale, today?: string): string {
  const span = overdueSpan({ due_date: dueDate ?? null }, today)
  if (!span) return ""
  let text: string
  if (span.total < 30 || span.months === 0) text = t("urgency.overdue", { days: span.total })
  else {
    // {mo}/{d} are the English plurals; the Khmer and Chinese texts don't use them.
    const params = { months: span.months, days: span.days, total: span.total, mo: span.months === 1 ? "mo" : "mos", d: span.days === 1 ? "day" : "days" }
    text = t(span.days === 0 ? "urgency.overdueMonths" : "urgency.overdueMonthsDays", params)
  }
  return locale === "km" ? khmerDigits(text) : text
}

/** A converted amount, always marked as approximate: "≈ 2,060,000៛". */
export const formatApprox = (amount: number, currency: Currency, hidden = false) => `≈ ${formatMoney(amount, currency, { hidden })}`
