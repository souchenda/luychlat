import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanSlip } from "./bank-slip"

describe("cleanSlip — themed ABA transfer (customer's slip, '-867,700 KHR', 11:27 AM)", () => {
  const read = { is_slip: true, amount: -867700, currency: "KHR", direction: "OUT", bank: "ABA", date: "2026-10-08", time: "11:27 AM", party: "Unknown", account: "001 879 507", owner: "SOU CHENDA AND TIM SREYLEAK", to_account: "016 472 333" }

  it("drops the minus sign: 867,700 KHR", () => {
    const s = cleanSlip(read)!
    assert.equal(s.amount, 867700)
    assert.equal(s.currency, "KHR")
    assert.equal(s.time, "11:27")
    assert.equal(s.toAccount, "016472333")
  })
  it("a number taken from the time ('11:27' → $11) is refused, never booked", () => {
    assert.equal(cleanSlip({ ...read, amount: 11, currency: "USD" }), null)
    assert.equal(cleanSlip({ ...read, amount: 27, currency: "USD" }), null)
    assert.ok(cleanSlip({ ...read, amount: 11, currency: "USD", time: "09:05" }))
  })
  it("no bank printed but a 3-3-3 account → ABA", () => {
    assert.equal(cleanSlip({ ...read, bank: null })!.bank, "ABA")
    assert.equal(cleanSlip({ ...read, bank: null, account: "0123456789" })!.bank, null)
  })
})
