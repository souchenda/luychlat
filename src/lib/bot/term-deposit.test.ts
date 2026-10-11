import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanTermDeposit, daysTo, depositPayload, depositText, depositWalletName } from "./term-deposit"

// The founder's ACLEDA Goal Saving screenshot (11/10/2026), as Vision reads it.
const ACLEDA_FD = {
  is_deposit: true,
  bank: "ACLEDA",
  account_number: "10120102",
  currency: "KHR",
  principal: "37,321,570.14",
  maturity_amount: 38192137.57,
  interest_rate: 6.25,
  open_date: "2025-10-21",
  maturity_date: "2026-10-21",
  payout_account: "16824223",
}

describe("fixed deposit — reading the ACLEDA screenshot", () => {
  const d = cleanTermDeposit(ACLEDA_FD)!
  it("the fields", () => {
    assert.deepEqual(d, {
      bank: "ACLEDA",
      accountNumber: "10120102",
      currency: "KHR",
      principal: 37_321_570.14,
      maturityAmount: 38_192_137.57,
      rate: 6.25,
      openDate: "2025-10-21",
      maturityDate: "2026-10-21",
      payoutAccount: "16824223",
    })
  })
  it("the goal wallet: masked name, balance = principal, goal = maturity amount by the maturity date", () => {
    assert.equal(depositWalletName(d), "ACLEDA FD ***0102")
    assert.deepEqual(depositPayload(d), {
      bank: "ACLEDA",
      wallet_name: "ACLEDA FD ***0102",
      currency: "KHR",
      principal: 37_321_570.14,
      maturity_amount: 38_192_137.57,
      maturity_date: "2026-10-21",
      icon: "acleda",
    })
  })
  it("the confirmation: amounts, interest earned, 10 days to maturity", () => {
    assert.equal(daysTo("2026-10-11", "2026-10-21"), 10)
    const text = depositText(d, "2026-10-11", "DL MEAT SUPPLY")
    assert.match(text, /ប្រាក់ដើម៖ 37,321,570\.14៛/)
    assert.match(text, /ទទួលបាននៅកាលកំណត់៖ 38,192,137\.57៛ \(\+870,567\.43៛\)/)
    assert.match(text, /21\/10\/2026 \(នៅសល់ 10 ថ្ងៃ\)/)
    assert.match(text, /6\.25% ក្នុងមួយឆ្នាំ/)
    assert.ok(!text.includes("10120102"), "the account number is never in full")
  })
})

describe("fixed deposit — what isn't accepted", () => {
  it("not a deposit, no principal or maturity date; a maturity amount below the principal is dropped", () => {
    assert.equal(cleanTermDeposit({ is_deposit: false }), null)
    assert.equal(cleanTermDeposit({ ...ACLEDA_FD, principal: null }), null)
    assert.equal(cleanTermDeposit({ ...ACLEDA_FD, maturity_date: "21 Oct 2026" }), null)
    assert.equal(cleanTermDeposit({ ...ACLEDA_FD, maturity_amount: 1000 })?.maturityAmount, null)
  })
})
