import { NON_OPERATING_KEYS } from "@/lib/categories/presets"
import type { Category, Transaction } from "@/lib/data/types"
import { convert, roundMoney } from "@/lib/money"

/**
 * «ចាយខុសធម្មតា» — a gentle word when one kind of spending runs well above its usual (founder, 9/11/2026): «ខែនេះ ចាយ
 * កាហ្វេ $45 រួចហើយ — ធម្មតាប្រហែល $22 ក្នុងមួយខែ». Pure. Nothing guessed:
 *
 *  - the usual = the average of the last three FULL months of that category, and only when at least two of them had any
 *    spending (a new habit has no «usual»);
 *  - flagged only when this month so far is at least 1.5× the usual AND at least $10 more (a $3 coffee habit is no news);
 *  - money that is not spending (debt principal, adjustments) never counts;
 *  - the one with the largest gap is said; never a list.
 */
export type Unusual = { categoryId: string; thisMonth: number; usual: number; ratio: number }

export const RATIO = 1.5
export const MIN_GAP_USD = 10
const HISTORY = 3

/** The Cambodian month of a stored time (the database keeps UTC: 1 Nov 03:00 in Phnom Penh is 31 Oct 20:00 UTC). */
const monthOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 7)

/** The YYYY-MM of `month` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function unusualSpending(transactions: Transaction[], categories: Category[], khrPerUsd: number, thisMonth: string): Unusual | null {
  const excluded = new Set(categories.filter((c) => c.preset_key && NON_OPERATING_KEYS.has(c.preset_key)).map((c) => c.id))
  const past = Array.from({ length: HISTORY }, (_, i) => shiftMonth(thisMonth, -(i + 1)))
  const sums = new Map<string, Map<string, number>>() // category → month → USD
  for (const t of transactions) {
    if (t.type !== "EXPENSE" || !t.category_id || excluded.has(t.category_id)) continue
    const m = monthOf(t.transaction_date)
    if (m !== thisMonth && !past.includes(m)) continue
    const byMonth = sums.get(t.category_id) ?? new Map<string, number>()
    byMonth.set(m, (byMonth.get(m) ?? 0) + convert(t.amount, t.currency, "USD", khrPerUsd))
    sums.set(t.category_id, byMonth)
  }
  let best: Unusual | null = null
  for (const [categoryId, byMonth] of sums) {
    const now = byMonth.get(thisMonth) ?? 0
    const active = past.filter((m) => (byMonth.get(m) ?? 0) > 0)
    if (now <= 0 || active.length < 2) continue
    const usual = past.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) / HISTORY
    if (usual <= 0 || now < usual * RATIO || now - usual < MIN_GAP_USD) continue
    const u = { categoryId, thisMonth: roundMoney(now, "USD"), usual: roundMoney(usual, "USD"), ratio: Math.round((now / usual) * 10) / 10 }
    if (!best || u.thisMonth - u.usual > best.thisMonth - best.usual) best = u
  }
  return best
}
