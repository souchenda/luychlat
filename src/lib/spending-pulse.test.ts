import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rielTick, spendingPulse } from "./spending-pulse"

// Friday 17 October 2026, 21:00 in Cambodia.
const NOW = Date.parse("2026-10-17T14:00:00Z")
const tx = (ict: string, amount: number, currency = "KHR", type = "EXPENSE", category_id: string | null = null) => ({
  type, amount, currency, category_id, transaction_date: new Date(Date.parse(`${ict}+07:00`)).toISOString(),
})

describe("spending pulse — per day, week or month, in riel", () => {
  it("daily: the last 7 Cambodian days, Khmer weekdays, today last", () => {
    const r = spendingPulse([tx("2026-10-17T09:00:00", 50_000), tx("2026-10-11T08:00:00", 20_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.points.length, 7)
    assert.deepEqual(r.points.map((p) => p.label), ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"])
    assert.equal(r.points.at(-1)!.khr, 50_000)
    assert.equal(r.points[0].khr, 20_000)
    assert.equal(r.total, 70_000)
  })
  it("a transaction at 23:30 in Phnom Penh counts on that Cambodian day (not UTC's)", () => {
    const r = spendingPulse([tx("2026-10-16T23:30:00", 10_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.points.find((p) => p.key === "2026-10-16")!.khr, 10_000)
  })
  it("dollars count at the rate; income, transfers and adjustment categories never count", () => {
    const r = spendingPulse(
      [tx("2026-10-17T09:00:00", 10, "USD"), tx("2026-10-17T09:00:00", 99_000, "KHR", "INCOME"), tx("2026-10-17T09:00:00", 99_000, "KHR", "TRANSFER"), tx("2026-10-17T09:00:00", 5_000, "KHR", "EXPENSE", "adj")],
      "day",
      { now: NOW, khrPerUsd: 4100, exclude: new Set(["adj"]) },
    )
    assert.equal(r.total, 41_000)
  })
  it("the change against the same span before; none when that span was empty", () => {
    const r = spendingPulse([tx("2026-10-17T09:00:00", 150_000), tx("2026-10-08T09:00:00", 100_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.previous, 100_000)
    assert.equal(r.pct, 50)
    assert.equal(spendingPulse([tx("2026-10-17T09:00:00", 1)], "day", { now: NOW, khrPerUsd: 4000 }).pct, null)
  })
  it("weekly: 8 weeks starting Monday; monthly: 6 months with Khmer month names", () => {
    const w = spendingPulse([], "week", { now: NOW, khrPerUsd: 4000 })
    assert.equal(w.points.length, 8)
    assert.equal(w.points.at(-1)!.key, "2026-10-12")
    const m = spendingPulse([tx("2026-10-02T10:00:00", 30_000)], "month", { now: NOW, khrPerUsd: 4000 })
    assert.equal(m.points.length, 6)
    assert.equal(m.points.at(-1)!.label, "តុលា")
    assert.equal(m.points.at(-1)!.khr, 30_000)
  })
})

describe("riel guide labels", () => {
  it("«10 ម៉ឺន», «1.5 លាន» in Khmer (international digits — founder, 21/10/2026); K / M in English", () => {
    assert.equal(rielTick(100_000, "km"), "10 ម៉ឺន")
    assert.equal(rielTick(1_500_000, "km"), "1.5 លាន")
    assert.equal(rielTick(200_000, "en"), "200K")
    assert.equal(rielTick(0, "km"), "0")
  })
})
