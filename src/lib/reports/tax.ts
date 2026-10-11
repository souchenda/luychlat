/**
 * Monthly tax estimate for a Cambodian small taxpayer (Business workspace, /reports/tax). The rates
 * are the founder's (11/10/2026) and only an estimate to set money aside — the person confirms with
 * their accountant / the GDT before filing:
 *   • Minimum tax (ពន្ធលើប្រាក់ចំណូលអប្បបរមា): 1% of the month's gross sales;
 *   • Withholding tax on rent (ពន្ធកាត់ទុកថ្លៃជួល): 10% of the month's premises / warehouse rent;
 *   • Patent tax (ពន្ធប៉ាតង់): 400,000 ៛ a year, due by 31 March — set aside 1/12 each month.
 * Everything in riel (tax is filed in riel), rounded to the nearest 100 ៛. Pure (tax.test.ts).
 */
import { profitAndLoss } from "@/lib/reports/pl"
import { roundRiel } from "@/lib/money"
import type { Category, Transaction } from "@/lib/data/types"

export const MINIMUM_TAX_RATE = 0.01
export const RENT_WHT_RATE = 0.1
export const PATENT_TAX_KHR = 400_000
/** Due date, as month-day. */
export const PATENT_DUE = "03-31"

export type TaxEstimate = {
  /** Gross sales of the month (riel): the P&L's revenue — sales and services, not capital or other income. */
  salesKhr: number
  /** Rent of the month (riel). */
  rentKhr: number
  minimumTaxKhr: number
  rentWhtKhr: number
  /** The patent tax's monthly share (1/12). */
  patentShareKhr: number
  /** Recommended to set aside this month. */
  reserveKhr: number
  /** The patent reminder: days until 31 March (Jan–Mar), else null. */
  patentDueInDays: number | null
}

/** Rent: the «rent» category, and whatever category the RENT bills record their payments in. */
export function rentCategoryIds(categories: Pick<Category, "id" | "preset_key">[], rentBillCategoryIds: (string | null)[] = []): Set<string> {
  return new Set([...categories.filter((c) => c.preset_key === "rent").map((c) => c.id), ...rentBillCategoryIds.filter((id): id is string => Boolean(id))])
}

/** The month's estimate from its transactions; `today` (YYYY-MM-DD, Cambodia) for the patent reminder. */
export function taxEstimate(
  transactions: Transaction[],
  categories: Category[],
  khrPerUsd: number,
  today: string,
  rentBillCategoryIds: (string | null)[] = [],
): TaxEstimate {
  const salesKhr = roundRiel(Math.max(0, profitAndLoss(transactions, categories, khrPerUsd).revenue.khr))
  const rentIds = rentCategoryIds(categories, rentBillCategoryIds)
  let rentKhr = 0
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || !tx.category_id || !rentIds.has(tx.category_id)) continue
    rentKhr += tx.currency === "KHR" ? tx.amount : tx.amount * khrPerUsd
  }
  rentKhr = roundRiel(rentKhr)
  // Cambodian rounding: every riel figure the estimate computes, to the nearest 100 ៛.
  const minimumTaxKhr = roundRiel(salesKhr * MINIMUM_TAX_RATE)
  const rentWhtKhr = roundRiel(rentKhr * RENT_WHT_RATE)
  const patentShareKhr = roundRiel(PATENT_TAX_KHR / 12)
  return {
    salesKhr,
    rentKhr,
    minimumTaxKhr,
    rentWhtKhr,
    patentShareKhr,
    reserveKhr: minimumTaxKhr + rentWhtKhr + patentShareKhr,
    patentDueInDays: patentDueInDays(today),
  }
}

/** Days until this year's 31 March, from January to March; null the rest of the year. */
export function patentDueInDays(today: string): number | null {
  const month = Number(today.slice(5, 7))
  if (month > 3) return null
  const due = Date.parse(`${today.slice(0, 4)}-${PATENT_DUE}T12:00:00Z`)
  return Math.round((due - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
}
