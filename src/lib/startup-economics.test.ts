import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { netNewPerMonth, startupReport, type Cost } from "./startup-economics"

const costs: Cost[] = [
  { name: "Droplet", usd: 24, kind: "FIXED" },
  { name: "Supabase", usd: 25, kind: "FIXED" },
  { name: "Domain", usd: 1, kind: "FIXED" },
  { name: "AI per paying user", usd: 0.5, kind: "PER_PAYING" },
]

describe("App Luy Chlat as a startup — break-even, self-sustaining, steady profit (founder, 4/11/2026)", () => {
  it("ARPU, contribution and the paying users each stage needs — by stated rules", () => {
    const r = startupReport({ mrrUsd: 60, payingUsers: 20, payingHistory: [8, 12, 16, 20], costs, founderPayUsd: 300, profitTarget: 0.2 })
    assert.equal(r.arpu, 3) // $60 ÷ 20
    assert.equal(r.contribution, 2.5) // $3 − $0.50
    assert.equal(r.fixedUsd, 50)
    assert.equal(r.profitUsd, 0) // 60 − 50 − 0.5 × 20
    assert.equal(r.netNewPerMonth, 4) // (20 − 8) ÷ 3
    assert.deepEqual(r.milestones, [
      { stage: "BREAK_EVEN", payingNeeded: 20, monthsAway: 0 }, // 50 ÷ 2.5
      { stage: "SELF_SUSTAINING", payingNeeded: 140, monthsAway: 30 }, // 350 ÷ 2.5; (140 − 20) ÷ 4
      { stage: "PROFIT", payingNeeded: 185, monthsAway: 42 }, // 350 ÷ (2.5 − 20% × 3) = 184.2 → 185; (185 − 20) ÷ 4 = 41.25 → 42
    ])
    assert.equal(r.stage, "BREAK_EVEN")
  })

  it("the stages: loss, near (≥ 70% of break-even), break-even, self-sustaining, profit", () => {
    const base = { mrrUsd: 0, payingUsers: 0, payingHistory: [], costs, founderPayUsd: 300, profitTarget: 0.2 }
    assert.equal(startupReport({ ...base, mrrUsd: 30, payingUsers: 10 }).stage, "LOSS") // needs 20
    assert.equal(startupReport({ ...base, mrrUsd: 45, payingUsers: 15 }).stage, "NEAR")
    assert.equal(startupReport({ ...base, mrrUsd: 450, payingUsers: 150 }).stage, "SELF_SUSTAINING")
    assert.equal(startupReport({ ...base, mrrUsd: 600, payingUsers: 200 }).stage, "PROFIT")
  })

  it("never a made-up date: no growth or shrinking → months unknown; no paying users → nothing computed", () => {
    const flat = startupReport({ mrrUsd: 30, payingUsers: 10, payingHistory: [10, 10, 10], costs, founderPayUsd: 0, profitTarget: 0 })
    assert.equal(flat.milestones[0].monthsAway, null)
    const none = startupReport({ mrrUsd: 0, payingUsers: 0, payingHistory: [], costs, founderPayUsd: 0, profitTarget: 0 })
    assert.equal(none.arpu, null)
    assert.equal(none.milestones[0].payingNeeded, null)
    assert.equal(none.stage, "LOSS")
    assert.equal(none.profitUsd, -50)
    // A variable cost above the price: no number of users ever breaks even.
    assert.equal(startupReport({ mrrUsd: 10, payingUsers: 10, payingHistory: [], costs: [{ name: "x", usd: 2, kind: "PER_PAYING" }], founderPayUsd: 0, profitTarget: 0 }).milestones[0].payingNeeded, null)
  })

  it("growth: the average net new paying users a month over the last 3 months", () => {
    assert.equal(netNewPerMonth([1, 2, 4, 8, 14]), 4) // (14 − 2) ÷ 3
    assert.equal(netNewPerMonth([5]), null)
    assert.equal(netNewPerMonth([10, 7]), -3)
  })
})
