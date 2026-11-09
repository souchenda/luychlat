import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { customShares, evenShares, splitMessage } from "./split-bill"

describe("Split a bill (founder, 9/11/2026)", () => {
  it("even in dollars: each share floored to the cent, the payer takes the rest, the sum is the bill", () => {
    const r = evenShares(10, "USD", ["Dara", "Sophea"])
    assert.deepEqual(r.shares.map((s) => s.amount), [3.33, 3.33])
    assert.equal(r.mine, 3.34)
    assert.equal(r.mine + r.shares.reduce((s, x) => s + x.amount, 0), 10)
  })

  it("even in riel: each share rounded down to 100 ៛ (a computed riel), the payer takes the rest", () => {
    const r = evenShares(100_000, "KHR", ["A", "B"])
    assert.deepEqual(r.shares.map((s) => s.amount), [33_300, 33_300])
    assert.equal(r.mine, 33_400)
    assert.ok(r.shares.every((s) => s.amount % 100 === 0))
  })

  it("nobody to share with, or no amount: nothing owed", () => {
    assert.deepEqual(evenShares(12, "USD", []), { mine: 12, shares: [] })
    assert.deepEqual(evenShares(0, "USD", ["A"]), { mine: 0, shares: [] })
  })

  it("custom amounts: typed amounts stay exact; never more than the bill, never an empty name or a zero", () => {
    assert.deepEqual(customShares(20, "USD", [{ name: "A", amount: 7.5 }, { name: "B", amount: 4.25 }]), { mine: 8.25, ok: true })
    assert.equal(customShares(20, "USD", [{ name: "A", amount: 21 }]).ok, false)
    assert.equal(customShares(20, "USD", [{ name: " ", amount: 5 }]).ok, false)
    assert.equal(customShares(20, "USD", [{ name: "A", amount: 0 }]).ok, false)
    assert.deepEqual(customShares(45_550, "KHR", [{ name: "A", amount: 15_550 }]), { mine: 30_000, ok: true })
  })

  it("the message to the group lists each part with 0-9 digits", () => {
    const m = splitMessage("ញ៉ាំបាយ", "USD", [{ name: "Dara", amount: 3.33 }], "km")
    assert.equal(m, "ចែកថ្លៃ៖ ញ៉ាំបាយ\n• Dara: $3.33\n— អេប លុយឆ្លាត")
    assert.doesNotMatch(m, /[០-៩]/)
  })
})
