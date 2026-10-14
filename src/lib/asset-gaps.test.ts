import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assetGaps } from "./asset-gaps"

const none = { goldError: false, goldUnpriced: 0, diamondsError: false, investmentsError: false, propertyError: false }

describe("net worth — what could not be counted is said, never a silent $0", () => {
  it("everything loaded and priced → no gap", () => {
    assert.deepEqual(assetGaps(none), [])
  })
  it("gold that failed to load, or has no rate (market rates didn't load), is a gap", () => {
    assert.deepEqual(assetGaps({ ...none, goldError: true }), ["gold"])
    assert.deepEqual(assetGaps({ ...none, goldUnpriced: 2 }), ["gold"])
  })
  it("each failed asset list is named, in order", () => {
    assert.deepEqual(assetGaps({ ...none, diamondsError: true, propertyError: true, investmentsError: true }), ["diamonds", "investments", "property"])
  })
})
