import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canonicalBank, cleanLoanDetail, detailToSchedule, isVehicleLoan, UNKNOWN_BANK } from "./loan-detail-read"
import { importPlan } from "./schedule-read"

// Readings as the vision model returns them for three real-world screens.
const PPCB_CAR = {
  is_loan_detail: true,
  // PPCBank Mobile (dark / green); the model may misread the logo — the account number settles it.
  bank: "Canadia Bank",
  product: "New Car Loan to Individual-USD",
  account: "1-223-00004253-8",
  currency: "USD",
  principal: 22000,
  outstanding: 16506.21,
  rate: 9.99,
  rate_period: "YEAR",
  open_date: "2025-03-20",
  end_date: "2030-03-20",
  months: null,
  next_due: "2026-10-15",
  installment: null,
  method: "AMORTIZATION",
}
const ABA = {
  is_loan_detail: true,
  bank: "ABA",
  product: "ABA Home Loan",
  account: "000 123 456",
  currency: "USD",
  principal: 30000,
  outstanding: "28,412.55",
  rate: 0.75,
  rate_period: "MONTH",
  open_date: null,
  end_date: null,
  months: 120,
  next_due: "2026-11-05",
  installment: 380.29,
  method: null,
}
const ACLEDA_KH = {
  is_loan_detail: true,
  bank: "ធនាគារ អេស៊ីលីដា ACLEDA",
  product: "ឥណទានអាជីវកម្ម",
  account: "0001-01-123456-7",
  currency: "KHR",
  principal: 40_000_000,
  outstanding: 31_000_000,
  rate: 15,
  rate_period: "YEAR",
  open_date: "2025-01-10",
  end_date: "2028-01-10",
  months: null,
  next_due: "2026-10-25",
  installment: null,
  method: null,
}

describe("loan detail — any Cambodian bank", () => {
  it("PPCBank car loan: the account 1-223-… names PPCBank (even when the logo was misread); 60 months", () => {
    const d = cleanLoanDetail(PPCB_CAR)!
    assert.equal(d.bank, "PPCBank")
    assert.equal(d.account, "1-223-00004253-8")
    assert.equal(d.principal, 22000)
    assert.equal(d.outstanding, 16506.21)
    assert.equal(d.annualRate, 9.99)
    assert.equal(d.months, 60)
    assert.ok(isVehicleLoan(d.product))
  })
  it("…stored as «PPCBank · New Car Loan…»: the standard installment, 18 paid, next #19 on 15/10/2026, last in March 2030", () => {
    const s = detailToSchedule(cleanLoanDetail(PPCB_CAR)!)
    assert.equal(s.installmentStated, false)
    assert.equal(s.installment, 467.33)
    assert.equal(s.paidThrough, 18)
    assert.equal(s.nextNo, 19)
    assert.equal(s.firstDue, "2025-04-15")
    assert.equal(s.lender, "PPCBank · New Car Loan to Individual-USD")
    const plan = importPlan(s, "2026-10-12")
    assert.equal(plan.paidCount, 18)
    assert.equal(plan.shown.nextDue, "2026-10-15")
    assert.ok(Math.abs(plan.shown.outstanding - 16506.21) < 1)
    assert.equal(plan.schedule.rows.at(-1)!.date.slice(0, 7), "2030-03")
  })
  it("ABA: a monthly rate and a printed installment and term are used as printed", () => {
    const d = cleanLoanDetail(ABA)!
    assert.equal(d.bank, "ABA Bank")
    assert.equal(d.annualRate, 9)
    assert.equal(d.outstanding, 28412.55)
    const s = detailToSchedule(d)
    assert.equal(s.installmentStated, true)
    assert.equal(s.installment, 380.29)
    assert.equal(s.months, 120)
    assert.ok(!isVehicleLoan(d.product))
  })
  it("ACLEDA in Khmer, riel: brand from the Khmer name, 36 months, a whole-riel installment", () => {
    const d = cleanLoanDetail(ACLEDA_KH)!
    assert.equal(d.bank, "ACLEDA Bank")
    assert.equal(d.currency, "KHR")
    assert.equal(d.months, 36)
    const s = detailToSchedule(d)
    assert.equal(s.installment % 1, 0)
    assert.ok(s.paidThrough! > 0 && s.paidThrough! < 36)
  })
  it("PPCBank by its account shape (1-22X-XXXXXXXX-X), the house loan too; another shape keeps the screen's name", () => {
    assert.equal(canonicalBank(null, "1-224-00006341-4"), "PPCBank")
    assert.equal(canonicalBank("Canadia", "1-223-00004253-8"), "PPCBank")
    assert.equal(canonicalBank("Canadia Bank", "0011-1234567"), "Canadia Bank")
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, bank: null })!.bank, "PPCBank")
  })
  it("no bank on the screen and no known account shape: «កម្ចីធនាគារ (Bank Loan)», never a failure", () => {
    assert.equal(canonicalBank(null), UNKNOWN_BANK)
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, bank: null, account: "555-1" })!.bank, UNKNOWN_BANK)
  })
  it("not a loan detail, missing essentials or implausible figures → null (the person enters it by hand)", () => {
    assert.equal(cleanLoanDetail({ is_loan_detail: false }), null)
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, next_due: null }), null)
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, outstanding: 50000 }), null)
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, open_date: null, end_date: null }), null)
    assert.equal(cleanLoanDetail({ ...PPCB_CAR, rate: 99 }), null)
  })
})
