import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { allowanceDue, lastOccurrence, weekdayOf } from "./allowance"

describe("Children's pocket money (founder, 9/11/2026)", () => {
  it("knows the weekday and the latest allowance day", () => {
    assert.equal(weekdayOf("2026-11-09"), 1) // Monday
    assert.equal(lastOccurrence(1, "2026-11-09"), "2026-11-09")
    assert.equal(lastOccurrence(6, "2026-11-09"), "2026-11-07") // the Saturday before
    assert.equal(lastOccurrence(0, "2026-11-14"), "2026-11-08")
  })

  it("due on its day, once a week; a missed day is still asked", () => {
    const a = { weekday: 1, given_on: null, created_at: "2026-11-01T03:00:00Z" }
    assert.equal(allowanceDue(a, "2026-11-09"), "2026-11-09")
    assert.equal(allowanceDue({ ...a, given_on: "2026-11-09" }, "2026-11-09"), null)
    assert.equal(allowanceDue({ ...a, given_on: "2026-11-09" }, "2026-11-12"), null)
    assert.equal(allowanceDue({ ...a, given_on: "2026-11-02" }, "2026-11-11"), "2026-11-09") // missed Monday, asked Wednesday
  })

  it("never due for a day before it was set up", () => {
    assert.equal(allowanceDue({ weekday: 1, given_on: null, created_at: "2026-11-10T02:00:00Z" }, "2026-11-12"), null)
    // Set up on Monday 9 Nov at 06:30 in Phnom Penh (8 Nov 23:30 UTC): that Monday counts.
    assert.equal(allowanceDue({ weekday: 1, given_on: null, created_at: "2026-11-08T23:30:00Z" }, "2026-11-09"), "2026-11-09")
  })

  it("the database: the wallet's own access, nothing moves by itself", () => {
    const sql = readFileSync("supabase/migrations/20270307000000_kids_allowance.sql", "utf8")
    assert.match(sql, /wallet_id\s+uuid not null unique references public\.wallets_accounts \(id\) on delete cascade/)
    assert.match(sql, /alter table public\.allowances enable row level security;/)
    assert.match(sql, /revoke all on public\.allowances from anon;/)
    assert.doesNotMatch(sql, /insert into public\.transactions/) // the transfer is the person's tap, made by the app
  })
})
