import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { importErrorReason, importErrorText } from "./api"

describe("statement save errors are named, not hidden", () => {
  it("maps the database's errors to a reason", () => {
    assert.equal(importErrorReason({ message: "already_imported" }), "already_imported")
    assert.equal(importErrorReason({ message: "goal_transfers_only" }), "goal_wallet")
    assert.equal(importErrorReason({ message: "personal_wallet: only its owner can use this wallet" }), "personal_wallet")
    assert.equal(importErrorReason({ message: "line 12 is outside the statement period" }), "outside_period")
    assert.equal(importErrorReason({ message: "category type does not match transaction type" }), "category")
    assert.equal(importErrorReason({ message: "something new" }), "generic")
  })
  it("keeps the database's own words, short", () => {
    assert.equal(importErrorText({ code: "23514", message: "new row violates check constraint \"x\"" }), "23514 new row violates check constraint \"x\"")
    assert.ok(importErrorText({ message: "y".repeat(500) }).length <= 300)
  })
})
