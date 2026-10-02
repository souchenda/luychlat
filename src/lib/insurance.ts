import type { Debt } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"

/**
 * Loan insurance on a debt (credit life / collateral cover that Cambodian
 * banks often require). Suggestions only: any insurer name can be typed.
 */
export const INSURERS = [
  "Forte Insurance",
  "Manulife Cambodia",
  "AIA Cambodia",
  "Prudential Cambodia",
  "Sovannaphum Life",
  "Dai-ichi Life Cambodia",
  "Prévoir Kampuchea",
  "Cambodia Life Insurance",
  "Infinity General Insurance",
  "Caminco Insurance",
  "People & Partners Insurance",
  "Phillip Life",
]

/** Days until the insurance renewal (negative = overdue), or null when there is none. */
export function renewalDays(debt: Pick<Debt, "insured" | "insurance_renewal_date">, today: string = todayDate()): number | null {
  if (!debt.insured || !debt.insurance_renewal_date) return null
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((day(debt.insurance_renewal_date) - day(today)) / 86_400_000)
}

/** Renewals to remind about: overdue or within `withinDays` (open debts only). */
export function upcomingRenewals<T extends Pick<Debt, "insured" | "insurance_renewal_date" | "status">>(debts: T[], withinDays = 30, today: string = todayDate()) {
  return debts
    .map((debt) => ({ debt, days: renewalDays(debt, today) }))
    .filter((r): r is { debt: T; days: number } => r.days !== null && r.days <= withinDays && r.debt.status !== "SETTLED")
    .sort((a, b) => a.days - b.days)
}
