import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { spendingChange } from "./analytics"

describe("home spending trend — this month against last month", () => {
  it("the change in percent, rounded; up and down", () => {
    assert.deepEqual(spendingChange([100, 200, 250]), { current: 250, previous: 200, pct: 25 })
    assert.equal(spendingChange([300, 150]).pct, -50)
  })
  it("nothing last month (or no data) → no percentage, never infinity", () => {
    assert.equal(spendingChange([0, 120]).pct, null)
    assert.deepEqual(spendingChange([]), { current: 0, previous: 0, pct: null })
  })
})
