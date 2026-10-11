import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanTermDeposit, daysTo, depositBillTitle, depositPayload, depositText, depositWalletName } from "./term-deposit"

// The founder's Chip Mong Bank fixed deposit screenshot (11/10/2026 — Chip Mong, not ACLEDA), as Vision reads it.
const CHIP_MONG_FD = {
  is_deposit: true,
  bank: "Chip Mong Bank",
  account_number: "10120102",
  currency: "KHR",
  principal: "37,321,570.14",
  maturity_amount: 38192137.57,
  interest_rate: 6.25,
  open_date: "2025-10-21",
  maturity_date: "2026-10-21",
  payout_account: "16824223",
}

describe("fixed deposit — reading the Chip Mong Bank screenshot", () => {
  const d = cleanTermDeposit(CHIP_MONG_FD)!
  it("the fields", () => {
    assert.deepEqual(d, {
      bank: "Chip Mong Bank",
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
    assert.equal(depositWalletName(d), "Chip Mong Bank FD ***0102")
    assert.deepEqual(depositPayload(d), {
      bank: "Chip Mong Bank",
      wallet_name: "Chip Mong Bank FD ***0102",
      bill_title: "Chip Mong Bank — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ២១ តុលា ២០២៦)",
      currency: "KHR",
      principal: 37_321_570.14,
      maturity_amount: 38_192_137.57,
      maturity_date: "2026-10-21",
      icon: "chipmong",
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
    assert.equal(cleanTermDeposit({ ...CHIP_MONG_FD, principal: null }), null)
    assert.equal(cleanTermDeposit({ ...CHIP_MONG_FD, maturity_date: "21 Oct 2026" }), null)
    assert.equal(cleanTermDeposit({ ...CHIP_MONG_FD, maturity_amount: 1000 })?.maturityAmount, null)
  })
})

describe("fixed deposit — the bank is the one on the screen", () => {
  it("named as the app names it (and its logo); never ACLEDA by default", () => {
    assert.equal(depositWalletName({ bank: "CHIP MONG BANK PLC", accountNumber: "10120102" }), "Chip Mong Bank FD ***0102")
    assert.equal(depositPayload(cleanTermDeposit({ ...CHIP_MONG_FD, bank: "ChipMong" })!).icon, "chipmong")
    assert.equal(depositWalletName({ bank: "ACLEDA Bank Plc.", accountNumber: "1" }), "ACLEDA FD ***1")
    assert.equal(depositPayload(cleanTermDeposit({ ...CHIP_MONG_FD, bank: null })!).wallet_name, "Bank FD ***0102")
    assert.equal(depositBillTitle({ bank: "Chip Mong Bank", maturityDate: "2026-10-21" }), "Chip Mong Bank — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ២១ តុលា ២០២៦)")
  })
})
