import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeSchedule } from "./amortization"
import { cleanScheduleRead, importedText, importPlan, loanPayload, solveMonthlyRate } from "./schedule-read"

// The CLC repayment schedule (4757.jpg) as Vision AI reads it on 10/10/2026.
const CLC = {
  is_schedule: true,
  lender: "Cambodian Labor Care PLC",
  account: "994-005084-01-4",
  currency: "USD",
  principal: "9,599.00",
  rate: 0.82,
  rate_period: "MONTH",
  months: 48,
  installment: 244,
  method: "ANNUITY",
  disbursed: "2026-01-12",
  first_due: "2026-02-10",
  next_no: 9,
  next_due: "2026-10-13",
  next_amount: 244,
  outstanding: 8241,
}

describe("loan schedule — the bank formula is unchanged", () => {
  it("$38,000 · 7.99% · 120 months · $2.50: #1 $379.01, then $463.34", () => {
    const s = computeSchedule({ principal: 38000, currency: "USD", rate: 7.99, ratePeriod: "YEAR", months: 120, method: "BANK", firstPaymentDate: "2026-10-20", startDate: "2026-09-30", fee: 2.5, payment: 460.84 })
    assert.equal(s.rows[0].payment, 379.01)
    assert.equal(s.rows[1].payment, 463.34)
    assert.equal(s.basePayment, 460.84)
  })
})

describe("loan schedule — reading the CLC schedule", () => {
  const read = cleanScheduleRead(CLC)!
  it("the fields", () => {
    assert.deepEqual(
      { ...read },
      {
        lender: "Cambodian Labor Care PLC",
        account: "994-005084-01-4",
        currency: "USD",
        principal: 9599,
        monthlyRate: 0.82,
        months: 48,
        installment: 244,
        method: "ANNUITY",
        disbursed: "2026-01-12",
        firstDue: "2026-02-10",
        nextNo: 9,
        nextDue: "2026-10-13",
        nextAmount: 244,
        outstanding: 8241,
        dueDates: null,
        paidThrough: null,
      },
    )
  })
  it("the plan: a BANK loan at CLC's $244, 8 installments paid, #9 next", () => {
    const plan = importPlan(read, "2026-10-10")
    assert.equal(plan.input.method, "BANK")
    assert.equal(plan.schedule.basePayment, 244)
    assert.equal(plan.schedule.rows[1].payment, 244)
    assert.equal(plan.schedule.rows.length, 48)
    assert.equal(plan.paidCount, 8)
    assert.equal(plan.paidUntil, "2026-09-10")
    assert.equal(plan.next?.n, 9)
    // The printed balance after #8 is kept exactly (the formula's $2.89 drift is absorbed by #8),
    // and #9 is on its printed date, 13/10.
    assert.deepEqual(plan.input.anchor, { n: 8, balance: 8241 })
    assert.equal(plan.paidAmount, 1358)
    assert.equal(plan.schedule.rows[7].balance, 8241)
    assert.equal(plan.next?.date, "2026-10-13")
    assert.equal(plan.next?.payment, 244)
    assert.deepEqual(plan.shown, { installment: 244, outstanding: 8241, nextDue: "2026-10-13", nextAmount: 244 })
  })
  it("without the next number: months from the first due date to the next date; without either, by today", () => {
    assert.equal(importPlan({ ...read, nextNo: null }, "2026-10-10").paidCount, 8)
    assert.equal(importPlan({ ...read, nextNo: null, nextDue: null }, "2026-10-10").paidCount, 8)
    assert.equal(importPlan({ ...read, nextNo: null, nextDue: null }, "2026-10-11").paidCount, 9)
  })
  it("the 10/10 bug: a misread «next is #11» never marks future rows paid — 8 paid, #9 next", () => {
    const plan = importPlan({ ...read, nextNo: 11, nextDue: "2026-12-10", outstanding: 7883.77 }, "2026-10-10")
    assert.equal(plan.paidCount, 8)
    assert.equal(plan.paidUntil, "2026-09-10")
    assert.equal(plan.next?.n, 9)
    // A balance that isn't row #8's (it is #10's) is not used as the anchor.
    assert.equal(plan.input.anchor, null)
  })
  it("printed dates are followed (13/10, not 10/10); a stamped «paid» row counts even when due later", () => {
    const dates = Array.from({ length: 48 }, (_, i) => (i === 8 ? "2026-10-13" : null))
    const plan = importPlan({ ...read, nextNo: null, nextDue: null, dueDates: dates }, "2026-10-12")
    assert.equal(plan.paidCount, 8) // #9 is printed 13/10: not before 12/10
    assert.equal(plan.next?.date, "2026-10-13")
    assert.equal(importPlan({ ...read, paidThrough: 9 }, "2026-10-10").paidCount, 9)
  })
  it("what bot_import_loan saves", () => {
    const p = loanPayload(read, importPlan(read, "2026-10-10"))
    assert.deepEqual(
      { party: p.party_name, note: p.note, method: p.method, rate: p.interest_rate, start: p.start_date, total: p.total_amount, payment: p.payment, count: p.count, first: p.first_due, due: p.due_date, paidDate: p.paid_date, bill: p.bill_amount },
      { party: "Cambodian Labor Care PLC", note: "កុង 994-005084-01-4 · 📑 ពីរូបថតតារាងកាលវិភាគ", method: "BANK", rate: 0.82, start: "2026-01-12", total: 9599, payment: 244, count: 48, first: "2026-02-10", due: "2030-01-10", paidDate: "2026-09-10", bill: 244 },
    )
    assert.equal(p.paid_amount, 1358)
    assert.equal(p.anchor_n, 8)
    assert.equal(p.anchor_balance, 8241)
    assert.equal(p.due_dates?.[8], "2026-10-13")
  })
  it("the bot's confirmation", () => {
    assert.equal(
      importedText(read, importPlan(read, "2026-10-10")),
      [
        "📑 តារាងកាលវិភាគកម្ចី Cambodian Labor Care PLC ត្រូវបានកត់ត្រាជោគជ័យ!",
        "🏦 ស្ថាប័ន៖ Cambodian Labor Care PLC (កុង 994-005084-01-4)",
        "💵 ត្រូវបង់ប្រចាំខែ៖ $244.00",
        "⏳ ប្រាក់ដើមនៅសល់៖ $8,241.00",
        "📅 លើកបន្ទាប់៖ 13/10/2026 ($244.00)",
        "",
        "ប្រព័ន្ធបានបង្កើតកាលវិភាគ 48 ខែ និងកំណត់រំលឹកបង់ប្រាក់អូតូរួចរាល់!",
      ].join("\n"),
    )
  })
})

describe("loan schedule — what isn't accepted, and a missing rate", () => {
  it("not a schedule, or implausible figures", () => {
    assert.equal(cleanScheduleRead({ is_schedule: false }), null)
    assert.equal(cleanScheduleRead({ ...CLC, months: 0 }), null)
    assert.equal(cleanScheduleRead({ ...CLC, installment: 100 }), null) // 100 × 48 < 9,599
    assert.equal(cleanScheduleRead({ ...CLC, first_due: "10/02/2026" }), null)
  })
  it("the rate is solved from the installment when not printed", () => {
    assert.ok(Math.abs(solveMonthlyRate(9599, 48, 242.72) - 0.82) < 0.001)
    const plan = importPlan({ ...cleanScheduleRead(CLC)!, monthlyRate: null }, "2026-10-10")
    assert.ok(plan.input.rate > 0.83 && plan.input.rate < 0.86, String(plan.input.rate)) // $244 is a little above 0.82%'s annuity
    assert.equal(plan.schedule.rows[1].payment, 244)
  })
})
