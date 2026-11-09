import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Transaction, Wallet } from "@/lib/data/types"
import { daysLeftInMonth, monthEnd, safeToSpend, type SafeBill } from "./safe-to-spend"

const wallet = (p: Partial<Wallet>): Wallet =>
  ({ id: "w", workspace_id: "ws", name: "w", balance: 0, currency: "USD", icon: null, color: null, sort_order: 0, archived_at: null, created_at: "2026-01-01", visibility: "SHARED", owner_id: null, ...p }) as Wallet
const bill = (p: Partial<SafeBill>): SafeBill => ({ id: "b", title: "b", amount: 0, currency: "USD", due: "2026-11-20", is_active: true, ...p })
const tx = (p: Partial<Transaction>): Transaction => ({ id: "t", workspace_id: "ws", wallet_id: "w", to_wallet_id: null, category_id: null, amount: 0, to_amount: null, currency: "USD", type: "EXPENSE", exchange_rate: null, note: null, receipt_url: null, transaction_date: "2026-11-02", created_at: "2026-11-02", debt_id: null, created_by: null, created_by_name: null, ...p }) as Transaction

describe("Safe to spend today (founder, 9/11/2026)", () => {
  it("counts the days left in the month, today included", () => {
    assert.equal(monthEnd("2026-11-10"), "2026-11-30")
    assert.equal(monthEnd("2028-02-03"), "2028-02-29")
    assert.equal(daysLeftInMonth("2026-11-10"), 21)
    assert.equal(daysLeftInMonth("2026-11-30"), 1)
  })

  it("money in hand less this month's bills, shared over the days left; riel rounded to 100", () => {
    const r = safeToSpend({
      wallets: [wallet({ id: "a", balance: 300 }), wallet({ id: "k", balance: 410_000, currency: "KHR" })],
      bills: [bill({ id: "rent", title: "Rent", amount: 150, due: "2026-11-25" }), bill({ id: "edc", title: "EDC", amount: 82_000, currency: "KHR", due: "2026-11-15" })],
      transactions: [],
      khrPerUsd: 4100,
      today: "2026-11-10",
    })
    assert.equal(r.cash, 400)
    assert.equal(r.bills, 170)
    assert.deepEqual(r.billItems.map((b) => b.id), ["edc", "rent"]) // soonest first
    assert.equal(r.free, 230)
    assert.equal(r.perDay, 10.95) // 230 / 21, floored to the cent — never more than there is
    assert.equal(r.perDayKhr, 44_900) // 10.95 × 4,100 = 44,895 → 44,900
    assert.equal(r.status, "ok")
  })

  it("never counts savings goals or credit cards as money in hand, and an overdraft is a minus", () => {
    const r = safeToSpend({
      wallets: [wallet({ id: "a", balance: 100 }), wallet({ id: "g", balance: 500, goal_target: 1000 }), wallet({ id: "cc", balance: -80, kind: "CREDIT_CARD" }), wallet({ id: "od", balance: -20 }), wallet({ id: "x", balance: 999, archived_at: "2026-10-01" })],
      bills: [],
      transactions: [],
      khrPerUsd: 4000,
      today: "2026-11-30",
    })
    assert.equal(r.cash, 80)
    assert.equal(r.perDay, 80)
  })

  it("an overdue bill counts; a bill after this month, an inactive one and a deposit maturity do not", () => {
    const r = safeToSpend({
      wallets: [wallet({ balance: 100 })],
      bills: [bill({ id: "late", amount: 10, due: "2026-10-28" }), bill({ id: "next", amount: 50, due: "2026-12-01" }), bill({ id: "off", amount: 50, is_active: false }), bill({ id: "fd", amount: 1000, kind: "DEPOSIT" })],
      transactions: [],
      khrPerUsd: 4000,
      today: "2026-11-10",
    })
    assert.deepEqual(r.billItems.map((b) => b.id), ["late"])
  })

  it("sets aside a dated goal's monthly need, less what was already moved into it this month", () => {
    const goal = wallet({ id: "g", balance: 0, goal_target: 1200, goal_date: "2027-11-10" }) // 12 months → $100 a month
    const base = { wallets: [wallet({ id: "a", balance: 500 }), goal], bills: [], khrPerUsd: 4000, today: "2026-11-10" }
    assert.equal(safeToSpend({ ...base, transactions: [] }).goals, 100)
    const moved = [tx({ type: "TRANSFER", wallet_id: "a", to_wallet_id: "g", amount: 60, transaction_date: "2026-11-05" }), tx({ type: "TRANSFER", to_wallet_id: "g", amount: 999, transaction_date: "2026-10-05" })]
    assert.equal(safeToSpend({ ...base, transactions: moved }).goals, 40)
  })

  it("more to pay than in hand: zero today and «short», never a negative daily amount", () => {
    const r = safeToSpend({ wallets: [wallet({ balance: 50 })], bills: [bill({ amount: 80 })], transactions: [], khrPerUsd: 4000, today: "2026-11-10" })
    assert.equal(r.free, -30)
    assert.equal(r.perDay, 0)
    assert.equal(r.perDayKhr, 0)
    assert.equal(r.status, "short")
  })
})
