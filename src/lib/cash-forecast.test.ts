import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { Bill } from "./bills"
import { cashForecast, FORECAST_DAYS } from "./cash-forecast"
import type { Transaction, Wallet } from "./data/types"
import { FEATURE_KEYS } from "./features"

const TODAY = "2026-11-03"
const wallet = (id: string, balance: number, currency: "USD" | "KHR", extra: Partial<Wallet> = {}) =>
  ({ id, name: id, balance, currency, archived_at: null, goal_target: null, kind: "STANDARD", ...extra }) as Wallet
const bill = (title: string, amount: number, currency: "USD" | "KHR", due_day: number, extra: Partial<Bill> = {}) =>
  ({
    id: title,
    title,
    kind: "OTHER",
    amount,
    currency,
    frequency: "MONTHLY",
    due_day,
    due_date: null,
    paid_until: "2026-10-31",
    created_at: "2026-01-01T00:00:00Z",
    category_id: null,
    is_active: true,
    ...extra,
  }) as Bill
type Tx = Pick<Transaction, "type" | "amount" | "currency" | "transaction_date" | "category_id" | "debt_id">
/** One row a day for the 28 days before today. */
const everyDay = (type: Tx["type"], amount: number, currency: "USD" | "KHR" = "USD", extra: Partial<Tx> = {}): Tx[] =>
  Array.from({ length: 28 }, (_, i) => ({
    type,
    amount,
    currency,
    transaction_date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (i + 1) * 86_400_000).toISOString().slice(0, 10),
    category_id: null,
    debt_id: null,
    ...extra,
  }))

describe("14-day cash-flow forecast (founder, 3/11/2026)", () => {
  it("«ថ្ងៃទី 5 ត្រូវបង់ PPCBank $320 — បងនឹងខ្វះ $45»: the first payment the money would not cover, and by how much", () => {
    const f = cashForecast({
      today: TODAY,
      wallets: [wallet("aba", 260, "USD")],
      bills: [bill("PPCBank", 320, "USD", 5, { kind: "LOAN" })],
      transactions: [...everyDay("INCOME", 20), ...everyDay("EXPENSE", 12.5)],
      khrPerUsd: 4000,
    })!
    assert.equal(f.days.length, FORECAST_DAYS)
    assert.equal(f.dailyIn, 20)
    assert.equal(f.dailyOut, 12.5)
    // 260 + 2 × 7.50 − 320 = −45 on the 5th.
    assert.deepEqual(f.short && { title: f.short.payment.title, date: f.short.payment.date, by: f.short.by }, { title: "PPCBank", date: "2026-11-05", by: 45 })
    assert.deepEqual(f.lowest, { date: "2026-11-05", balance: -45 })
  })

  it("enough money: no shortfall; the lowest day is still shown", () => {
    const f = cashForecast({ today: TODAY, wallets: [wallet("aba", 1000, "USD")], bills: [bill("ទឹកភ្លើង", 40, "USD", 10)], transactions: everyDay("INCOME", 5), khrPerUsd: 4000 })!
    assert.equal(f.short, null)
    assert.equal(f.payments.length, 1)
    // 1000 + 7 × $5 − $40 on the 10th.
    assert.deepEqual(f.lowest, { date: "2026-11-10", balance: 995 })
  })

  it("the balance: ordinary wallets only — no savings goal, credit card or archived wallet; riel converted at the rate", () => {
    const f = cashForecast({
      today: TODAY,
      wallets: [
        wallet("aba", 100, "USD"),
        wallet("cash", 200_000, "KHR"),
        wallet("goal", 5000, "USD", { goal_target: 9000 }),
        wallet("card", -300, "USD", { kind: "CREDIT_CARD" }),
        wallet("old", 999, "USD", { archived_at: "2026-01-01" }),
      ],
      bills: [],
      transactions: [],
      khrPerUsd: 4000,
    })!
    assert.equal(f.currency, "USD")
    assert.equal(f.start, 150)
    assert.equal(cashForecast({ today: TODAY, wallets: [wallet("goal", 1, "USD", { goal_target: 5 })], bills: [], transactions: [], khrPerUsd: 4000 }), null)
  })

  it("all in riel: the forecast in riel, computed riel rounded to 100 ៛", () => {
    const f = cashForecast({ today: TODAY, wallets: [wallet("cash", 500_000, "KHR")], bills: [], transactions: everyDay("INCOME", 10_330, "KHR"), khrPerUsd: 4000 })!
    assert.equal(f.currency, "KHR")
    assert.equal(f.dailyIn, 10_300)
    for (const d of f.days) assert.equal(d.balance % 100, 0)
  })

  it("no double counting: loan repayments and the bills' own payments leave the average — they come on their dates", () => {
    const f = cashForecast({
      today: TODAY,
      wallets: [wallet("aba", 1000, "USD")],
      bills: [bill("ទឹកភ្លើង", 40, "USD", 10, { category_id: "utilities" })],
      transactions: [
        ...everyDay("EXPENSE", 10),
        { type: "EXPENSE", amount: 40, currency: "USD", transaction_date: "2026-10-10", category_id: "utilities", debt_id: null },
        { type: "EXPENSE", amount: 320, currency: "USD", transaction_date: "2026-10-05", category_id: null, debt_id: "loan" },
        { type: "TRANSFER", amount: 500, currency: "USD", transaction_date: "2026-10-06", category_id: null, debt_id: null },
      ],
      khrPerUsd: 4000,
    })!
    assert.equal(f.dailyOut, 10)
  })

  it("under a week of records: no average (the bills alone) and the screen is told", () => {
    const f = cashForecast({ today: TODAY, wallets: [wallet("aba", 100, "USD")], bills: [], transactions: everyDay("INCOME", 50).slice(0, 3), khrPerUsd: 4000 })!
    assert.equal(f.averaged, false)
    assert.equal(f.dailyIn, 0)
    assert.equal(f.days.at(-1)?.balance, 100)
  })

  it("on Home: a sibling below the hero, behind the flag, the method always on the card, numbers masked with the eye", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
    const home = read("src/app/(app)/home/page.tsx")
    assert.match(home, /<SmartHub [^\n]*\/>\r?\n[^\n]*\r?\n\s+<CashForecastCard /)
    const card = read("src/components/dashboard/cash-forecast-card.tsx")
    assert.match(card, /useFeatures\(\)\.allowed\("cash_forecast"\)/)
    assert.match(card, /t\("forecast\.method", /)
    assert.match(card, /t\("forecast\.methodShort"\)/)
    // Never hidden with nothing due — it could not be found (founder, 3/11/2026).
    assert.doesNotMatch(card, /payments\.length === 0\) return null/)
    assert.match(card, /t\("forecast\.none", /)
    assert.doesNotMatch(card.replace(/formatMoney\([^)]*\{ hidden \}\)/g, ""), /formatMoney\(/)
    assert.ok(FEATURE_KEYS.includes("cash_forecast"))
    assert.match(read("supabase/migrations/20270283000000_cash_forecast_flag.sql"), /\('cash_forecast', 'ADMIN_ONLY'\)/)
  })

  it("bills: an overdue one counts today; beyond 14 days or inactive, not at all; a monthly bill once", () => {
    const f = cashForecast({
      today: TODAY,
      wallets: [wallet("aba", 1000, "USD")],
      bills: [
        bill("late", 10, "USD", 20, { paid_until: "2026-09-30" }),
        bill("far", 10, "USD", 25),
        bill("off", 10, "USD", 5, { is_active: false }),
        bill("rent", 200, "USD", 4),
      ],
      transactions: [],
      khrPerUsd: 4000,
    })!
    assert.deepEqual(
      f.payments.map((p) => [p.title, p.date, p.overdue]),
      [
        ["late", TODAY, true],
        ["rent", "2026-11-04", false],
      ],
    )
    assert.equal(f.days[0].balance, 990)
    assert.equal(f.days[1].balance, 790)
  })
})
