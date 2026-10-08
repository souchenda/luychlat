import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanSlip, resolveWallet } from "./bank-slip"

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

describe("cleanSlip — ABA bill payment / Smart Mobile top-up ('-5.00 USD')", () => {
  // What Gemini returns for an ABA "Smart Mobile (PIN-less)" top-up slip paid from "DL USD (016 824 222)".
  const read = { is_slip: true, amount: "-5.00", currency: "USD", direction: "OUT", bank: "ABA", date: "2026-10-08", time: "08:42 AM", party: "Smart Mobile", account: "016 824 222", account_name: "DL USD", consumer: "010 234 567" }

  it("a valid slip: $5.00 out to Smart Mobile, the phone number kept", () => {
    const s = cleanSlip(read)!
    assert.equal(s.amount, 5)
    assert.equal(s.currency, "USD")
    assert.equal(s.direction, "OUT")
    assert.equal(s.party, "Smart Mobile")
    assert.equal(s.consumer, "010 234 567")
    assert.equal(s.time, "08:42")
  })
  it("booked to the wallet named on the slip, never another USD wallet", () => {
    const s = cleanSlip(read)!
    const wallets = [
      { id: "aba-usd", name: "ABA Bank", currency: "USD" as const, account_no: "078824222" },
      { id: "dl-usd", name: "DL USD", currency: "USD" as const, account_no: null },
      { id: "dl-khr", name: "DL USD", currency: "KHR" as const, account_no: null },
    ]
    const pick = resolveWallet(s, wallets)
    assert.ok(pick && "wallet" in pick)
    assert.equal(pick.wallet.id, "dl-usd")
  })
  it("a real $5 top-up at 5 PM is kept; a bare 5 at 05:xx with nothing else is still refused", () => {
    assert.equal(cleanSlip({ ...read, time: "05:12 PM" })?.amount, 5)
    assert.equal(cleanSlip({ ...read, amount: "-5.00", consumer: null, time: "05:12 PM" })?.amount, 5)
    assert.equal(cleanSlip({ ...read, amount: 5, consumer: null, time: "05:12 PM" }), null)
  })
})
