import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cambodiaDate, isBirthdayToday, shouldCelebrate } from "./birthday"

const ict = (s: string) => Date.parse(`${s}+07:00`)

describe("birthday — today in Cambodia time", () => {
  it("matches month and day, any birth year", () => {
    assert.equal(isBirthdayToday("1990-10-14", ict("2026-10-14T09:00:00")), true)
    assert.equal(isBirthdayToday("1990-10-15", ict("2026-10-14T09:00:00")), false)
  })
  it("judged in Cambodia: 00:30 on the 15th there is still the 14th in UTC", () => {
    assert.equal(isBirthdayToday("1990-10-15", ict("2026-10-15T00:30:00")), true)
    assert.equal(isBirthdayToday("1990-10-14", ict("2026-10-15T00:30:00")), false)
    assert.deepEqual(cambodiaDate(ict("2026-10-15T00:30:00")), { year: 2026, month: 10, day: 15 })
  })
  it("29 February is celebrated on 28 February in other years, on the 29th in leap years", () => {
    assert.equal(isBirthdayToday("2000-02-29", ict("2027-02-28T08:00:00")), true)
    assert.equal(isBirthdayToday("2000-02-29", ict("2028-02-28T08:00:00")), false)
    assert.equal(isBirthdayToday("2000-02-29", ict("2028-02-29T08:00:00")), true)
  })
  it("no or malformed date → never", () => {
    assert.equal(isBirthdayToday(null, ict("2026-10-14T09:00:00")), false)
    assert.equal(isBirthdayToday("14/10/1990", ict("2026-10-14T09:00:00")), false)
  })
})

describe("birthday — the celebration once a year", () => {
  const now = ict("2026-10-14T09:00:00")
  it("shown when it's the birthday and not yet this year", () => {
    assert.equal(shouldCelebrate("1990-10-14", null, now), true)
    assert.equal(shouldCelebrate("1990-10-14", "2025", now), true)
  })
  it("not again the same year, and never on another day", () => {
    assert.equal(shouldCelebrate("1990-10-14", "2026", now), false)
    assert.equal(shouldCelebrate("1990-10-13", null, now), false)
  })
})
