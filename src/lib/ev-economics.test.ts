import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { benchmarkPetrol, evEconomics, parseDistance } from "./ev-economics"

describe("EV economics — cost per km and petrol savings", () => {
  // The founder's MG Marvel R month: 205.3 kWh at home (730៛/kWh) + $25.50 outside, 1,250 km.
  const m = { homeKwh: 205.3, rate: 730, publicUsd: 25.5, khrPerUsd: 4060, km: 1250, petrolPerLitre: 5150 }
  const e = evEconomics(m)
  it("totals are rounded to 100៛; the per-km rate keeps its precision", () => {
    // 205.3 × 730 = 149,869 + 25.50 × 4,060 = 103,530 → 253,399 → 253,400៛.
    assert.equal(e.totalKhr, 253400)
    assert.equal(e.totalUsd, 62.41)
    assert.equal(e.perKmKhr, 202.7) // 253,399 / 1,250 — not 200
    assert.equal(e.perKmUsd, 0.05)
  })
  it("against a petrol car (8.5 L/100 km at the live 5,150៛/L)", () => {
    // 1,250 km → 106.25 L × 5,150 = 547,187.5 → 547,200៛; saving 547,187.5 − 253,399 = 293,788.5 → 293,800៛.
    assert.equal(e.petrolKhr, 547200)
    assert.equal(e.savingsKhr, 293800)
    assert.equal(e.savingsUsd, 72.36)
  })
  it("no distance yet: totals only", () => {
    const n = evEconomics({ ...m, km: 0 })
    assert.equal(n.totalKhr, 253400)
    assert.equal(n.perKmKhr, null)
    assert.equal(n.savingsKhr, null)
  })
  it("the petrol benchmark: EA95 when listed, else EA92", () => {
    assert.equal(benchmarkPetrol({ super: 5450, regular: 5150 }), 5450)
    assert.equal(benchmarkPetrol({ super: null, regular: 5150 }), 5150)
    assert.equal(benchmarkPetrol(null), null)
  })
})

describe("distance from a message", () => {
  it("the odometer", () => {
    assert.deepEqual(parseDistance("គីឡូឡាន 15200"), { kind: "ODOMETER", km: 15200 })
    assert.deepEqual(parseDistance("គីឡូឡាន ១៥,២០០"), { kind: "ODOMETER", km: 15200 })
    assert.deepEqual(parseDistance("odometer 15,200"), { kind: "ODOMETER", km: 15200 })
  })
  it("a trip", () => {
    assert.deepEqual(parseDistance("ចម្ងាយ 120 គម"), { kind: "TRIP", km: 120 })
    assert.deepEqual(parseDistance("បើកឡាន 85km"), { kind: "TRIP", km: 85 })
  })
  it("not a distance", () => {
    assert.equal(parseDistance("កាហ្វេ 2$"), null)
    assert.equal(parseDistance("សាកឡាននៅផ្ទះ 45kwh"), null)
    assert.equal(parseDistance("ចម្ងាយ ឆ្ងាយ"), null)
  })
})
