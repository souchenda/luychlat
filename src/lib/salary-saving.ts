import type { Currency } from "./data/types"
import { goalProgress } from "./goals"
import { convert, roundMoney, roundRiel } from "./money"

/**
 * «💰 ប្រាក់ខែចូលហើយ — ផ្ទេរ $50 ទៅគោលដៅ «ទិញម៉ូតូ» ទេ?» (founder, 4/11/2026 — Personal): when a salary comes in, the goal
 * with the nearest date that still needs money this month, and how much — what it needs per month to reach its date
 * (goalProgress, the same figure the goal card shows) less what was already put in this month; never more than the salary.
 * A suggestion: the transfer is made only on the person's tap. Pure (salary-saving.test.ts).
 *   computed riel → 100 ៛ (roundRiel); dollars to the cent
 */
export type SavingGoal = { id: string; name: string; currency: Currency; balance: number; target: number; date: string | null; savedThisMonth: number }
export type SavingSuggestion = { goalId: string; goalName: string; goalCurrency: Currency; toAmount: number; fromAmount: number; fromCurrency: Currency }

const round = (n: number, c: Currency) => (c === "KHR" ? roundRiel(n) : roundMoney(n, "USD"))

export function salarySaving(o: { income: { amount: number; currency: Currency }; goals: SavingGoal[]; today: string; khrPerUsd: number }): SavingSuggestion | null {
  const today = new Date(`${o.today}T00:00:00`)
  const ranked = o.goals
    .filter((g) => g.date && g.date > o.today && g.target > g.balance)
    .map((g) => {
      const p = goalProgress({ balance: g.balance, goal_target: g.target, goal_date: g.date, currency: g.currency }, today)
      return { g, need: Math.min((p.perMonth ?? 0) - g.savedThisMonth, g.target - g.balance) }
    })
    .filter((x) => x.need > 0)
    .sort((a, b) => a.g.date!.localeCompare(b.g.date!))
  const pick = ranked[0]
  if (!pick || !(o.income.amount > 0)) return null
  let toAmount = round(pick.need, pick.g.currency)
  let fromAmount = round(convert(toAmount, pick.g.currency, o.income.currency, o.khrPerUsd), o.income.currency)
  // Never more than the salary that just came in.
  if (fromAmount > o.income.amount) {
    fromAmount = round(o.income.amount, o.income.currency)
    toAmount = round(convert(fromAmount, o.income.currency, pick.g.currency, o.khrPerUsd), pick.g.currency)
  }
  if (!(fromAmount > 0) || !(toAmount > 0)) return null
  return { goalId: pick.g.id, goalName: pick.g.name, goalCurrency: pick.g.currency, toAmount, fromAmount, fromCurrency: o.income.currency }
}
