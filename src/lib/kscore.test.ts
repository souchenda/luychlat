import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanKScore, gaugeFraction, guardianLenders, kscoreTrend, riskTone } from "./kscore"

// The founder's CBC screen (15 Sep 2026) as the vision model returns it.
const CBC = {
  is_kscore: true,
  score: 1044,
  risk_label: "Excellent",
  score_date: "2026-09-15",
  history: [
    { month: "2026-03", score: 700 },
    { month: "2026-05", score: 820 },
    { month: "2026-04", score: 760 },
    { month: "2026-06", score: 905 },
    { month: "2026-07", score: 960 },
    { month: "2026-08", score: 1010 },
    { month: "2026-09", score: 1044 },
  ],
  factors: ["Repayment history", "Credit utilisation"],
}

describe("CBC K-Score — the screenshot", () => {
  const k = cleanKScore(CBC, "2026-10-12")!
  it("score 1044 of 1400, CBC's own label, the score date", () => {
    assert.equal(k.score, 1044)
    assert.equal(k.riskLabel, "Excellent")
    assert.equal(k.scoreDate, "2026-09-15")
  })
  it("history in month order; +344 since March", () => {
    assert.deepEqual(k.history.map((h) => h.month), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"])
    assert.deepEqual(kscoreTrend(k), { from: "2026-03", delta: 344 })
  })
  it("the gauge: 100 → 0, 1400 → 1, 1044 ≈ 0.73", () => {
    assert.equal(gaugeFraction(100), 0)
    assert.equal(gaugeFraction(1400), 1)
    assert.equal(Math.round(gaugeFraction(1044) * 100), 73)
  })
  it("green only from CBC's words; no label → neutral (never derived from the number)", () => {
    assert.equal(riskTone("Excellent"), "good")
    assert.equal(riskTone("Low Risk"), "good")
    assert.equal(riskTone("High Risk"), "warn")
    assert.equal(riskTone(null), "neutral")
  })
  it("not a K-Score, a score outside 100–1400, or a future date → null", () => {
    assert.equal(cleanKScore({ is_kscore: false }, "2026-10-12"), null)
    assert.equal(cleanKScore({ ...CBC, score: 1500 }, "2026-10-12"), null)
    assert.equal(cleanKScore({ ...CBC, score: 99 }, "2026-10-12"), null)
    assert.equal(cleanKScore({ ...CBC, score_date: "2026-12-01" }, "2026-10-12"), null)
  })
})

describe("K-Score Guardian — the lenders to pay on time", () => {
  it("open loans' short names (CLC, PPCBank), each once; settled ones and money owed to me left out", () => {
    const names = guardianLenders([
      { type: "PAYABLE", status: "PARTIALLY_PAID", party_name: "Cambodian Labor Care PLC" },
      { type: "PAYABLE", status: "ACTIVE", party_name: "PPCBank កម្ចីផ្ទះ 35 (1-224-00006341-4)" },
      { type: "PAYABLE", status: "ACTIVE", party_name: "PPCBank · New Car Loan to Individual-USD" },
      { type: "PAYABLE", status: "SETTLED", party_name: "Old loan" },
      { type: "RECEIVABLE", status: "ACTIVE", party_name: "ហាង សុខា" },
    ])
    assert.deepEqual(names, ["Cambodian Labor Care PLC", "PPCBank"])
  })
})
