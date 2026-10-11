import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { inFilter, notificationKind, payerOf, transactionLine, walletShort, type FeedTransaction } from "./notification-feed"

const tx = (over: Partial<FeedTransaction>): FeedTransaction => ({
  id: "t",
  type: "INCOME",
  amount: 8000,
  currency: "KHR",
  note: "KHQR ពី SOU CHENDA (Ref: 8c36bc6d)",
  transaction_date: "2026-10-11T01:19:00Z",
  created_at: "2026-10-11T01:19:00Z",
  wallet_name: "ACLEDA 386***6262",
  category_name: "ការលក់",
  ...over,
})

describe("notification centre — money in and out", () => {
  it("a KHQR sale: amount, payer and the wallet's last digits only", () => {
    assert.deepEqual(transactionLine(tx({}), false), { title: "+8,000៛ ទទួលបានប្រាក់ពី SOU CHENDA (ACLEDA •••• 6262)", body: "ការលក់" })
    assert.equal(payerOf("KHQR ពី SOU CHENDA (*298) (Ref: 179168258818206)"), "SOU CHENDA")
    assert.equal(walletShort("ABA DL KHR"), "ABA DL KHR")
  })
  it("an expense: «-50,000៛ បានទូទាត់ …»", () => {
    assert.equal(transactionLine(tx({ type: "EXPENSE", amount: 50_000, note: "ថ្លៃទំនិញ", category_name: "ទំនិញ", wallet_name: "ABA DL KHR" }), false)?.title, "-50,000៛ បានទូទាត់ ថ្លៃទំនិញ (ABA DL KHR)")
    assert.equal(transactionLine(tx({ type: "EXPENSE", amount: 2.5, currency: "USD", note: null, category_name: "កាហ្វេ", wallet_name: null }), false)?.title, "-$2.50 បានទូទាត់ កាហ្វេ")
  })
  it("amounts hidden with the privacy switch; transfers between own wallets are not listed", () => {
    assert.match(transactionLine(tx({}), true)!.title, /^\+\*\*\*\*\*៛ /)
    assert.equal(transactionLine(tx({ type: "TRANSFER" }), false), null)
  })
})

describe("notification centre — the filter tabs", () => {
  it("bills and dues under 🔔, family activity under 💵", () => {
    assert.equal(notificationKind({ type: "DUE_DATE", debt_id: "d" }), "bills")
    assert.equal(notificationKind({ type: "DUE_DATE", debt_id: null, bill_id: "b" }), "bills")
    assert.equal(notificationKind({ type: "ACTIVITY", debt_id: null }), "money")
  })
  it("ទាំងអស់ shows everything; a tab only its own", () => {
    assert.ok(inFilter("tips", "all") && inFilter("money", "money"))
    assert.ok(!inFilter("bills", "money") && !inFilter("money", "tips"))
  })
})
