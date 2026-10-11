import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { billKindAllowed, scopeOf } from "./workspace-scope"

describe("workspace scope — no leakage between business and personal", () => {
  it("a business shows no NSSF cards, holy-day reminders or home EV charging", () => {
    assert.deepEqual(scopeOf("BUSINESS"), { nssf: false, holyDays: false, homeEv: false })
  })
  it("Personal (and Family) keep them all", () => {
    assert.deepEqual(scopeOf("PERSONAL"), { nssf: true, holyDays: true, homeEv: true })
    assert.deepEqual(scopeOf("FAMILY"), { nssf: true, holyDays: true, homeEv: true })
  })
  it("a business can't add an NSSF member bill; utilities, rent and the rest stay", () => {
    assert.equal(billKindAllowed("NSSF", "BUSINESS"), false)
    for (const kind of ["ELECTRICITY", "WATER", "INTERNET", "RENT", "WASTE", "LOAN", "OTHER"] as const) assert.ok(billKindAllowed(kind, "BUSINESS"), kind)
    assert.ok(billKindAllowed("NSSF", "PERSONAL"))
  })
})
