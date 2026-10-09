import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { SLIP_OUT } from "./bank-slip"
import { autoDecision, choiceIndex, heuristicChoice, merchantKey } from "./slip-auto"

describe("zero-click slips — memory first, then payee rules", () => {
  it("360 DEGREE COFFEE at 07:02 → coffee (a want), saved without a tap", () => {
    assert.equal(heuristicChoice("360 DEGREE COFFEE", "07:02"), "coffee")
    assert.deepEqual(autoDecision("360 DEGREE COFFEE", "07:02", null), { source: "rule", choice: "coffee" })
    assert.equal(SLIP_OUT[choiceIndex("coffee")].label, "bot.slipCat.coffee")
  })
  it("the user's habit wins over the rules", () => {
    const remembered = { choice: "food" as const, category_id: "c-food", need_want: "NEED" as const }
    assert.deepEqual(autoDecision("360 DEGREE COFFEE", "07:02", remembered), { source: "memory", remembered })
  })
  it("payee rules: fuel, marts, restaurants at meal times", () => {
    assert.equal(heuristicChoice("TOTAL ENERGIES TK", "18:40"), "fuel")
    assert.equal(heuristicChoice("Caltex Sen Sok", null), "fuel")
    assert.equal(heuristicChoice("CHIP MONG 271 MEGA MALL", "15:00"), "shopping")
    assert.equal(heuristicChoice("AEON MALL SEN SOK", "19:00"), "shopping")
    assert.equal(heuristicChoice("HUAT HUAT RESTAURANT BK", "07:45"), "food")
    assert.equal(heuristicChoice("HUAT HUAT RESTAURANT BK", "12:30"), "food")
    assert.equal(heuristicChoice("HUAT HUAT RESTAURANT BK", "03:10"), null)
    assert.equal(heuristicChoice("Brown Coffee & Bakery", "12:00"), "coffee")
  })
  it("anything else still asks", () => {
    assert.equal(heuristicChoice("SOK DARA", "10:00"), null)
    assert.equal(heuristicChoice(null, "10:00"), null)
    assert.equal(autoDecision("Unknown", "10:00", null), null)
  })
  it("merchant key: lower-case, single spaces", () => {
    assert.equal(merchantKey("  360  DEGREE COFFEE "), "360 degree coffee")
    assert.equal(merchantKey("ab"), null)
  })
})
