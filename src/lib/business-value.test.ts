import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PhysicalAsset } from "./assets"
import { businessValue, stockOnHand } from "./business-value"
import { walletDisplayName } from "./wallet-name"

const stock = (value: number, countedOn: string | null): PhysicalAsset =>
  ({ id: "s", workspace_id: "w", kind: "STOCK", name: "Stock", estimated_value: value, currency: "USD", purchase_date: countedOn, purchase_price: null, debt_id: null, note: null, useful_life_months: null, salvage_value: 0, serial_or_reference: null, status: "ACTIVE", disposed_on: null, location: null, area_m2: null, created_at: "" }) as PhysicalAsset

describe("stockOnHand (periodic: last count + bought since)", () => {
  const buys = [
    { amount: 200, currency: "USD" as const, date: "2026-09-28" },
    { amount: 300, currency: "USD" as const, date: "2026-10-02" },
    { amount: 400_000, currency: "KHR" as const, date: "2026-10-05" },
  ]
  it("adds only what was bought after the count", () => {
    const s = stockOnHand([stock(1000, "2026-09-30")], buys, 4000, "2026-10-08")
    assert.equal(s.bought, 400)
    assert.equal(s.value, 1400)
    assert.equal(s.countedOn, "2026-09-30")
  })
  it("a purchase on the count day is already in the count", () => {
    assert.equal(stockOnHand([stock(1000, "2026-10-02")], buys, 4000, "2026-10-08").bought, 100)
  })
  it("without a count: purchases since the 1st of this month", () => {
    const s = stockOnHand([], buys, 4000, "2026-10-08")
    assert.equal(s.value, 400)
    assert.equal(s.since, "2026-10-01")
  })
  it("flows into the business value; an inventory purchase moves cash into stock, the total holds", () => {
    const wallets = [{ balance: 700, currency: "USD" as const, archived_at: null, icon: "aba" }]
    const before = businessValue([{ ...wallets[0], balance: 1000 }], [stock(0, "2026-10-01")], [], 4000, "2026-10-08", [])
    const after = businessValue(wallets, [stock(0, "2026-10-01")], [], 4000, "2026-10-08", [{ amount: 300, currency: "USD", date: "2026-10-08" }])
    assert.equal(after.stock, 300)
    assert.equal(after.total, before.total)
  })
})

describe("walletDisplayName", () => {
  it("two ACLEDA wallets stay apart: currency and last digits", () => {
    assert.equal(walletDisplayName({ name: "ACLEDA 386***6262", currency: "KHR" }), "ACLEDA KHR (*6262)")
    assert.equal(walletDisplayName({ name: "ACLEDA 386***6222", currency: "USD" }), "ACLEDA USD (*6222)")
    assert.equal(walletDisplayName({ name: "ABA DL KHR", currency: "KHR" }), "ABA DL KHR")
  })
})
