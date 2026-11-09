import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Category, Transaction } from "@/lib/data/types"
import { shiftMonth, unusualSpending } from "./unusual-spending"

let n = 0
const tx = (category_id: string, amount: number, date: string, p: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${n++}`, workspace_id: "ws", wallet_id: "w", to_wallet_id: null, category_id, amount, to_amount: null, currency: "USD", type: "EXPENSE", exchange_rate: null, note: null, receipt_url: null, transaction_date: `${date}T10:00:00+07:00`, created_at: date, debt_id: null, created_by: null, created_by_name: null, ...p }) as Transaction
const cat = (id: string, preset_key: string | null = null): Category => ({ id, workspace_id: "ws", name: id, type: "EXPENSE", icon: null, color: null, preset_key, created_at: "2026-01-01" })

const history = (id: string, amount: number) => [tx(id, amount, "2026-08-10"), tx(id, amount, "2026-09-10"), tx(id, amount, "2026-10-10")]

describe("Unusual spending (founder, 9/11/2026)", () => {
  it("shifts months across the year", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12")
    assert.equal(shiftMonth("2026-11", -3), "2026-08")
  })

  it("says the category whose month so far is well above its usual", () => {
    const r = unusualSpending([...history("coffee", 22), tx("coffee", 45, "2026-11-08")], [cat("coffee")], 4000, "2026-11")
    assert.deepEqual(r, { categoryId: "coffee", thisMonth: 45, usual: 22, ratio: 2 })
  })

  it("quiet when the gap is small, the ratio low, or there is no usual yet", () => {
    assert.equal(unusualSpending([...history("coffee", 5), tx("coffee", 12, "2026-11-08")], [cat("coffee")], 4000, "2026-11"), null) // +$7 only
    assert.equal(unusualSpending([...history("food", 100), tx("food", 140, "2026-11-08")], [cat("food")], 4000, "2026-11"), null) // 1.4×
    assert.equal(unusualSpending([tx("new", 30, "2026-10-10"), tx("new", 90, "2026-11-08")], [cat("new")], 4000, "2026-11"), null) // one month of history
  })

  it("riel counts at the rate; debt principal and adjustments never count; income never counts", () => {
    const khr = [tx("fuel", 80_000, "2026-08-10", { currency: "KHR" }), tx("fuel", 80_000, "2026-09-10", { currency: "KHR" }), tx("fuel", 80_000, "2026-10-10", { currency: "KHR" }), tx("fuel", 200_000, "2026-11-05", { currency: "KHR" })]
    assert.equal(unusualSpending(khr, [cat("fuel")], 4000, "2026-11")?.thisMonth, 50)
    assert.equal(unusualSpending([...history("adj", 20), tx("adj", 500, "2026-11-01")], [cat("adj", "adjustment_out")], 4000, "2026-11"), null)
    assert.equal(unusualSpending([...history("x", 20), tx("x", 500, "2026-11-01", { type: "INCOME" })], [cat("x")], 4000, "2026-11"), null)
  })

  it("only the largest gap is said", () => {
    const r = unusualSpending([...history("a", 20), tx("a", 60, "2026-11-02"), ...history("b", 50), tx("b", 150, "2026-11-02")], [cat("a"), cat("b")], 4000, "2026-11")
    assert.equal(r?.categoryId, "b")
  })
})
