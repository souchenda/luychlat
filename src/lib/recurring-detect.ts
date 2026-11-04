import type { Currency } from "./data/types"

/**
 * «💡 រកឃើញការបង់ប្រចាំខែ» (founder, 4/11/2026): an expense the person pays every month — the same payee, about the same
 * amount, about the same day — noticed from their own entries and offered as a bill reminder with one tap. A suggestion
 * only: nothing is created without the tap. Pure (recurring-detect.test.ts).
 *
 *   the same payee   the entry's note without its amount and currency words («Smart 5$», «smart $5.00» → «smart»);
 *                    no note → the same category
 *   about the amount within 10% of the latest payment
 *   every month      3 calendar months in a row, the latest within the last 45 days, at most ~1 a month (a daily coffee
 *                    is not a bill), on days of the month no more than 7 apart
 *   not yet a bill   no active bill of that currency with that category or name and an amount within 10%
 */
export type RecurringTx = { amount: number; currency: Currency; type: string; category_id: string | null; note: string | null; transaction_date: string; debt_id?: string | null }
export type ExistingBill = { title: string; amount: number; currency: Currency; category_id: string | null; is_active: boolean }
export type RecurringFound = { key: string; title: string; amount: number; currency: Currency; dueDay: number; categoryId: string | null; months: number }

const AMOUNT_WORDS = /(\$|usd|dollars?|riels?|khr|៛|រៀល|ដុល្លារ|សេន|cents?|k)(?![\p{L}])/giu

/** The payee in a note: lower case, no digits, no currency words, no signs — «Smart 5$» → «smart». */
export function payeeKey(note: string | null | undefined): string {
  return (note ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[0-9០-៩.,]+/g, " ")
    .replace(AMOUNT_WORDS, " ")
    .replace(/[^\p{L}\p{M}]+/gu, "")
    .slice(0, 40)
}

/** The note shown as the bill's name: its words without the amount («Smart 5$» → «Smart»). */
const titleOf = (note: string | null) =>
  (note ?? "")
    .replace(/[0-9០-៩.,]+/g, " ")
    .replace(AMOUNT_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)

/** The Cambodian day of a timestamp (the database stores UTC: 00:30 on the 1st is still the 1st). */
const ictDay = (iso: string) => (iso.length > 10 ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10) : iso)
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.1
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000)

export function detectRecurring(o: { transactions: RecurringTx[]; bills: ExistingBill[]; today: string; categoryName?: (id: string | null) => string; max?: number }): RecurringFound[] {
  const groups = new Map<string, RecurringTx[]>()
  for (const raw of o.transactions) {
    const t = { ...raw, transaction_date: ictDay(raw.transaction_date) }
    if (t.type !== "EXPENSE" || t.debt_id || !(t.amount > 0)) continue
    if (daysBetween(o.today, t.transaction_date) > 150) continue
    const payee = payeeKey(t.note)
    const key = `${t.currency}:${payee || `cat:${t.category_id ?? "-"}`}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const found: RecurringFound[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    const latest = sorted[0]
    if (daysBetween(o.today, latest.transaction_date) > 45) continue
    const same = sorted.filter((t) => near(t.amount, latest.amount))
    // One payment a month, the latest per month — three months in a row, ending with the latest.
    const byMonth = new Map<number, RecurringTx>()
    for (const t of same) if (!byMonth.has(monthIndex(t.transaction_date))) byMonth.set(monthIndex(t.transaction_date), t)
    let run = 0
    for (let m = monthIndex(latest.transaction_date); byMonth.has(m); m--) run++
    if (run < 3) continue
    // A daily coffee or weekly market is not a bill: about one payment a month over the months it spans.
    if (same.length > run * 1.5) continue
    const days = [...byMonth.entries()].filter(([m]) => m > monthIndex(latest.transaction_date) - run).map(([, t]) => dayOf(t.transaction_date)).sort((a, b) => a - b)
    if (days[days.length - 1] - days[0] > 7) continue
    const payee = key.slice(4)
    const title = titleOf(latest.note) || (o.categoryName?.(latest.category_id) ?? "")
    if (!title) continue
    const already = o.bills.some(
      (b) => b.is_active && b.currency === latest.currency && near(b.amount, latest.amount) && ((b.category_id && b.category_id === latest.category_id) || (payee && !payee.startsWith("cat:") && payeeKey(b.title) === payee)),
    )
    if (already) continue
    found.push({ key, title, amount: latest.amount, currency: latest.currency, dueDay: days[Math.floor(days.length / 2)], categoryId: latest.category_id, months: run })
  }
  return found.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, o.max ?? 3)
}
