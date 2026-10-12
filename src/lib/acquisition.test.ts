import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ACQUISITION_SOURCES, shouldAskSource } from "./acquisition"

const now = Date.parse("2026-10-12T10:00:00Z")
const base = { createdAt: "2026-10-12T09:58:00Z", now, loaded: true, answered: false, skipped: false }

describe("first-visit question «តើបងបានស្គាល់ អេប លុយឆ្លាត តាមរយៈណាដែរ?»", () => {
  it("the four one-tap answers, saved as the database expects", () => {
    assert.deepEqual([...ACQUISITION_SOURCES], ["facebook", "telegram", "referral", "organic_search"])
  })
  it("asked on a new account's first visit", () => {
    assert.equal(shouldAskSource(base), true)
  })
  it("never again once answered; «រំលង» hides it for this visit only", () => {
    assert.equal(shouldAskSource({ ...base, answered: true }), false)
    assert.equal(shouldAskSource({ ...base, skipped: true }), false)
    assert.equal(shouldAskSource({ ...base, skipped: false }), true) // the next visit
  })
  it("not before the profile has loaded (no flash), and not for accounts older than 14 days", () => {
    assert.equal(shouldAskSource({ ...base, loaded: false }), false)
    assert.equal(shouldAskSource({ ...base, createdAt: "2026-09-27T09:00:00Z" }), false)
    assert.equal(shouldAskSource({ ...base, createdAt: "2026-09-29T11:00:00Z" }), true)
    assert.equal(shouldAskSource({ ...base, createdAt: null }), false)
  })
})
