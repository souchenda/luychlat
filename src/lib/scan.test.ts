import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanLoanDetail } from "./loans/loan-detail-read"
import { accountTitle, cleanAccount, cleanVehicle, loanFormFields } from "./scan"

describe("scan — bank account screen", () => {
  const a = cleanAccount({ is_account: true, bank: "Amret", account_name: "Kmeng Chhlat", account_no: "0102 3456 789", balance: 1250.5, currency: "USD" })!
  it("Amret «Kmeng Chhlat»: Amret's logo key, the account's own name, number and balance", () => {
    assert.equal(a.icon, "amret")
    assert.equal(a.bank, "Amret")
    assert.equal(a.accountName, "Kmeng Chhlat")
    assert.equal(a.accountNo, "0102 3456 789")
    assert.equal(a.balance, 1250.5)
    assert.equal(accountTitle(a, "Amret"), "Amret · Kmeng Chhlat")
  })
  it("«ក្មេងឆ្លាត» / Kmeng Chhlat is always Amret's — even when the reader guessed Chip Mong, or saw no bank", () => {
    for (const raw of [
      { is_account: true, bank: "Chip Mong Bank", account_name: "Kmeng Chhlat", balance: 10 },
      { is_account: true, bank: null, account_name: "ក្មេងឆ្លាត", balance: 10 },
      { is_account: true, bank: "Chip Mong", account_name: "KMENG CHLAT Savings", balance: 10 },
    ]) {
      const r = cleanAccount(raw)!
      assert.equal(r.bank, "Amret", JSON.stringify(raw))
      assert.equal(r.icon, "amret")
    }
    // Other Chip Mong accounts stay Chip Mong.
    assert.equal(cleanAccount({ is_account: true, bank: "Chip Mong Bank", account_name: "Fixed Deposit", balance: 10 })!.icon, "chipmong")
  })
  it("Amret written «អម្រឹត» is Amret too, with its logo", () => {
    assert.equal(cleanAccount({ is_account: true, bank: "គ្រឹះស្ថានមីក្រូហិរញ្ញវត្ថុ អម្រឹត", account_name: "Savings", balance: 5 })!.icon, "amret")
  })
  it("an unknown bank keeps its name with the generic icon; a malformed number or a negative balance is dropped", () => {
    const b = cleanAccount({ is_account: true, bank: "Some MFI", account_no: "ABC-1", balance: -5, currency: "KHR" })!
    assert.equal(b.icon, "other")
    assert.equal(b.accountNo, null)
    assert.equal(b.balance, null)
    assert.equal(b.currency, "KHR")
  })
  it("not an account, or nothing readable → null", () => {
    assert.equal(cleanAccount({ is_account: false }), null)
    assert.equal(cleanAccount({ is_account: true }), null)
  })
})

describe("scan — vehicle document", () => {
  it("inspection: plate and model joined, the expiry; no insurer outside insurance", () => {
    assert.deepEqual(cleanVehicle({ is_vehicle_doc: true, doc_type: "INSPECTION", plate: "2AB-1234", model: "MG Marvel R", expires_on: "2027-03-20", insurer: "Forte" }), {
      docType: "INSPECTION",
      vehicle: "MG Marvel R · 2AB-1234",
      expiresOn: "2027-03-20",
      provider: null,
    })
  })
  it("insurance keeps the insurer; a registration card has no document type to track (the person picks)", () => {
    assert.equal(cleanVehicle({ is_vehicle_doc: true, doc_type: "INSURANCE", plate: "2AB-1234", expires_on: "2027-01-01", insurer: "Forte" })!.provider, "Forte")
    assert.equal(cleanVehicle({ is_vehicle_doc: true, doc_type: "REGISTRATION", plate: "2AB-1234", expires_on: null })!.docType, null)
    assert.equal(cleanVehicle({ is_vehicle_doc: true, doc_type: "INSPECTION", expires_on: "bad" }), null)
  })
})

describe("scan — loan detail → the debt form", () => {
  it("PPCBank car loan: principal, yearly rate, 60 monthly bank installments from 15/04/2025", () => {
    const d = cleanLoanDetail({ is_loan_detail: true, bank: null, product: "New Car Loan to Individual-USD", account: "1-223-00004253-8", currency: "USD", principal: 22000, outstanding: 16506.21, rate: 9.99, rate_period: "YEAR", open_date: "2025-03-20", end_date: "2030-03-20", next_due: "2026-10-15" })!
    const f = loanFormFields(d)
    assert.equal(f.party, "PPCBank · New Car Loan to Individual-USD")
    assert.equal(f.total, "22000")
    assert.equal(f.interest, "9.99")
    assert.equal(f.schedCount, "60")
    assert.equal(f.schedMethod, "BANK")
    assert.equal(f.schedFirst, "2025-04-15")
    assert.equal(f.startDate, "2025-03-20")
    assert.equal(f.paid, 18)
    assert.equal(f.installmentStated, false)
  })
})
