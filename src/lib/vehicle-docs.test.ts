import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { daysLeft, docStatus, reminderDue, renewedExpiry, roadTaxDue, toggleRemindDay } from "./vehicle-docs"
import { scopeOf } from "./workspace-scope"

const TODAY = "2026-10-11"

describe("vehicle documents — expiry and status", () => {
  it("days left, and the three states (≤ 30 days = expiring soon)", () => {
    assert.equal(daysLeft("2026-11-10", TODAY), 30)
    assert.equal(docStatus("2026-12-31", TODAY), "valid")
    assert.equal(docStatus("2026-11-10", TODAY), "soon")
    assert.equal(docStatus(TODAY, TODAY), "soon")
    assert.equal(docStatus("2026-10-10", TODAY), "expired")
  })
})

describe("vehicle documents — reminders at D-30, D-15, D-7, the day, and when expired", () => {
  const on = (left: number) => new Date(Date.parse(`${TODAY}T12:00:00Z`) + left * 86_400_000).toISOString().slice(0, 10)
  it("exactly the reminder days (as run_vehicle_doc_alerts)", () => {
    const due = Array.from({ length: 40 }, (_, i) => i).filter((left) => reminderDue(on(left), TODAY))
    assert.deepEqual(due, [0, 7, 15, 30])
  })
  it("expired: the day after, then weekly — never every day", () => {
    const due = Array.from({ length: 30 }, (_, i) => -(i + 1)).filter((left) => reminderDue(on(left), TODAY))
    assert.deepEqual(due, [-1, -8, -15, -22, -29])
  })
})

describe("vehicle documents — the 30 / 15 / 7 reminder toggles", () => {
  it("a tap turns one off or back on; stored largest first, never twice", () => {
    assert.deepEqual(toggleRemindDay([30, 15, 7], 15), [30, 7])
    assert.deepEqual(toggleRemindDay([30, 7], 15), [30, 15, 7])
    assert.deepEqual(toggleRemindDay([7], 30), [30, 7])
  })
  it("all off still reminds on the day and when expired (the database rule)", () => {
    assert.equal(reminderDue("2026-10-20", "2026-10-20", []), true)
    assert.equal(reminderDue("2026-10-20", "2026-10-05", []), false)
  })
})

describe("road tax — the GDT deadline is 30 November, never 31 December", () => {
  it("a receipt for tax year 2026: paid; the next deadline is 30/11/2027", () => {
    assert.equal(roadTaxDue(2026), "2027-11-30")
  })
  it("«បន្តរួច» on road tax lands on 30 November — a 31 December entered before is corrected", () => {
    assert.equal(renewedExpiry("2027-11-30", "2027-11-10", "ROAD_TAX"), "2028-11-30")
    assert.equal(renewedExpiry("2026-12-31", "2026-12-20", "ROAD_TAX"), "2027-11-30")
    // other documents: a year on, as before
    assert.equal(renewedExpiry("2026-12-31", "2026-12-20", "INSPECTION"), "2027-12-31")
  })
})

describe("vehicle documents — «បន្តរួច»", () => {
  it("one year after the old expiry; from today when it had long expired; 29 Feb safe", () => {
    assert.equal(renewedExpiry("2026-10-20", TODAY), "2027-10-20")
    assert.equal(renewedExpiry("2026-01-05", TODAY), "2027-10-11")
    assert.equal(renewedExpiry("2028-02-29", "2028-02-01"), "2029-03-01")
  })
})

describe("vehicle documents — strictly the Personal workspace", () => {
  it("Personal yes; Business and Family no", () => {
    assert.equal(scopeOf("PERSONAL").vehicleDocs, true)
    assert.equal(scopeOf("BUSINESS").vehicleDocs, false)
    assert.equal(scopeOf("FAMILY").vehicleDocs, false)
    assert.equal(scopeOf(undefined).vehicleDocs, false)
  })
})
