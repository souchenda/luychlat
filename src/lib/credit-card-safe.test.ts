import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { safeUse } from "./credit-card"

describe("credit card — the 30% safe-use rule", () => {
  it("over: $1,901.43 owed on a $5,000 limit is $401.43 above the safe $1,500", () => {
    assert.deepEqual(safeUse({ owed: 1901.43, limit: 5000 }), { safeLimit: 1500, excess: 401.43, over: true })
  })
  it("within: the same debt on a $10,000 limit is under the safe $3,000", () => {
    assert.deepEqual(safeUse({ owed: 1901.43, limit: 10000 }), { safeLimit: 3000, excess: 0, over: false })
  })
  it("exactly 30% is still safe; nothing owed is safe", () => {
    assert.equal(safeUse({ owed: 1500, limit: 5000 }).over, false)
    assert.deepEqual(safeUse({ owed: 0, limit: 2000 }), { safeLimit: 600, excess: 0, over: false })
  })
})
