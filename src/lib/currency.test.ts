import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { roundToNearest100KHR } from "./currency"

describe("riel to the nearest 100៛", () => {
  it("calculated figures lose their odd tails", () => {
    assert.equal(roundToNearest100KHR(32996), 33000)
    assert.equal(roundToNearest100KHR(149869), 149900)
    assert.equal(roundToNearest100KHR(74533), 74500)
  })
  it("halves round up; already whole hundreds stay", () => {
    assert.equal(roundToNearest100KHR(150), 200)
    assert.equal(roundToNearest100KHR(692100), 692100)
    assert.equal(roundToNearest100KHR(0), 0)
  })
})
