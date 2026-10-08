import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { depreciationBetween, monthsBetween, registerTotals, schedule, type Depreciable } from "./fixed-assets"

const phone: Depreciable = { purchase_price: 1350, purchase_date: "2025-10-08", useful_life_months: 36, currency: "USD" }

describe("schedule", () => {
  it("$1,350 over 3 years: $37.50 a month, $900 after 12 months", () => {
    const s = schedule(phone, "2026-10-08")!
    assert.equal(s.monthly, 37.5)
    assert.equal(s.elapsed, 12)
    assert.equal(s.accumulated, 450)
    assert.equal(s.netBookValue, 900)
    assert.equal(s.remainingMonths, 24)
    assert.equal(s.status, "ACTIVE")
  })

  it("counts a month only once its day is reached", () => {
    assert.equal(schedule(phone, "2025-11-07")!.elapsed, 0)
    assert.equal(schedule(phone, "2025-11-08")!.elapsed, 1)
  })

  it("a purchase date in the future has 0 depreciation", () => {
    const s = schedule(phone, "2025-01-01")!
    assert.equal(s.elapsed, 0)
    assert.equal(s.accumulated, 0)
    assert.equal(s.netBookValue, 1350)
    assert.equal(depreciationBetween(phone, "2025-01-01", "2025-06-30"), 0)
  })

  it("never drops below salvage value past the useful life", () => {
    const van: Depreciable = { purchase_price: 20000, salvage_value: 2000, purchase_date: "2020-01-15", useful_life_months: 60, currency: "USD" }
    for (const day of ["2025-01-15", "2026-10-08", "2040-01-01"]) {
      const s = schedule(van, day)!
      assert.equal(s.netBookValue, 2000)
      assert.equal(s.accumulated, 18000)
      assert.equal(s.status, "FULLY_DEPRECIATED")
    }
    assert.equal(schedule(van, "2025-01-14")!.netBookValue, 2300)
  })

  it("the last month takes the rounding remainder", () => {
    const a: Depreciable = { purchase_price: 100, purchase_date: "2026-01-01", useful_life_months: 3, currency: "USD" }
    assert.equal(schedule(a, "2026-02-01")!.netBookValue, 66.67)
    assert.equal(schedule(a, "2026-03-01")!.netBookValue, 33.33)
    assert.equal(schedule(a, "2026-04-01")!.netBookValue, 0)
  })

  it("riel stays in whole riel", () => {
    const mixer: Depreciable = { purchase_price: 2_400_000, salvage_value: 100_000, purchase_date: "2026-01-15", useful_life_months: 36, currency: "KHR" }
    const s = schedule(mixer, "2026-10-08")!
    assert.equal(s.monthly, 63889)
    assert.equal(s.elapsed, 8)
    assert.equal(s.accumulated, 511111)
    assert.ok(Number.isInteger(s.netBookValue))
  })

  it("a salvage value above the cost is capped at the cost (nothing to depreciate)", () => {
    const s = schedule({ ...phone, salvage_value: 5000 }, "2027-01-01")!
    assert.equal(s.depreciable, 0)
    assert.equal(s.netBookValue, 1350)
  })

  it("stops on the disposal date", () => {
    const sold: Depreciable = { ...phone, status: "DISPOSED", disposed_on: "2026-04-08" }
    const s = schedule(sold, "2027-01-01")!
    assert.equal(s.elapsed, 6)
    assert.equal(s.status, "DISPOSED")
    assert.equal(depreciationBetween(sold, "2026-05-01", "2026-12-31"), 0)
  })

  it("does not depreciate without a life, cost or date", () => {
    assert.equal(schedule({ ...phone, useful_life_months: null }, "2026-10-08"), null)
    assert.equal(schedule({ ...phone, purchase_price: null }, "2026-10-08"), null)
    assert.equal(schedule({ ...phone, purchase_date: null }, "2026-10-08"), null)
  })
})

describe("depreciationBetween", () => {
  it("one month, and a year that starts mid-life", () => {
    assert.equal(depreciationBetween(phone, "2026-10-01", "2026-10-31"), 37.5)
    const mixer: Depreciable = { purchase_price: 2_400_000, purchase_date: "2026-01-15", useful_life_months: 24, currency: "KHR" }
    assert.equal(depreciationBetween(mixer, "2026-01-01", "2026-12-31"), 1_100_000)
  })
})

describe("monthsBetween", () => {
  it("handles month ends and years", () => {
    assert.equal(monthsBetween("2026-01-31", "2026-02-28"), 0)
    assert.equal(monthsBetween("2026-01-31", "2026-03-31"), 2)
    assert.equal(monthsBetween("2025-12-15", "2026-01-15"), 1)
  })
})

describe("registerTotals", () => {
  it("sums by currency and leaves disposed assets out", () => {
    const t = registerTotals(
      [
        phone,
        { purchase_price: 2_400_000, purchase_date: "2026-01-15", useful_life_months: 24, currency: "KHR" },
        { ...phone, status: "DISPOSED", disposed_on: "2026-01-01" },
      ],
      "2026-10-08",
    )
    assert.deepEqual(t.cost, { USD: 1350, KHR: 2_400_000 })
    assert.deepEqual(t.accumulated, { USD: 450, KHR: 800_000 })
    assert.deepEqual(t.nbv, { USD: 900, KHR: 1_600_000 })
  })
})
