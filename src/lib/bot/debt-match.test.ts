import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { debtLinkButtons, isDebtLinkCallback, isPaidMessage, matchPayableDebt, parseDebtLinkCallback } from "./debt-match"
import type { BotDebt } from "./parse-entry"

// The founder's open loans.
const DEBTS: BotDebt[] = [
  { id: "11111111-aaaa-4aaa-8aaa-111111111111", type: "PAYABLE", party_name: "PPCBank កម្ចីផ្ទះ 35 (1-224-00006341-4)", currency: "USD", remaining: 38000 },
  { id: "22222222-bbbb-4bbb-8bbb-222222222222", type: "PAYABLE", party_name: "Cambodian Labor Care PLC", currency: "USD", remaining: 8241 },
  { id: "33333333-cccc-4ccc-8ccc-333333333333", type: "PAYABLE", party_name: "PPCBank · New Car Loan to Individual-USD", currency: "USD", remaining: 16506.21 },
  { id: "44444444-dddd-4ddd-8ddd-444444444444", type: "RECEIVABLE", party_name: "Sokha", currency: "USD", remaining: 50 },
]

describe("which loan a payee or a typed name points to", () => {
  it("the receipt's payee «CAMBODIAN LABOR CARE PLC» → the CLC loan", () => {
    assert.equal(matchPayableDebt("CAMBODIAN LABOR CARE PLC", DEBTS)?.id, DEBTS[1].id)
  })
  it("typed «clc paid» / «បង់ clc» → the CLC loan", () => {
    assert.equal(matchPayableDebt("clc paid", DEBTS)?.id, DEBTS[1].id)
    assert.equal(matchPayableDebt("បង់ CLC", DEBTS)?.id, DEBTS[1].id)
  })
  it("«ppcbank paid» with two PPCBank loans → no guess; the account number settles it", () => {
    assert.equal(matchPayableDebt("ppcbank paid", DEBTS), null)
    assert.equal(matchPayableDebt("1-224-00006341-4", DEBTS)?.id, DEBTS[0].id)
  })
  it("a coffee shop, money owed to me, or an empty payee → nothing", () => {
    assert.equal(matchPayableDebt("BROWN COFFEE", DEBTS), null)
    assert.equal(matchPayableDebt("Sokha", DEBTS), null)
    assert.equal(matchPayableDebt("", DEBTS), null)
  })
  it("pay words: paid / pay / បង់ / បានសង", () => {
    for (const t of ["clc paid", "pay clc", "បង់ clc", "បានសង CLC ហើយ"]) assert.equal(isPaidMessage(t), true, t)
    assert.equal(isPaidMessage("clc"), false)
    assert.equal(isPaidMessage("payroll"), false)
  })
})

describe("the «record as a repayment?» buttons", () => {
  const tx = "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f"
  it("fit Telegram's 64 bytes and round-trip", () => {
    const [[yes, no]] = debtLinkButtons(tx, DEBTS[1].id).inline_keyboard
    assert.ok(Buffer.byteLength(yes.callback_data) <= 64)
    assert.ok(isDebtLinkCallback(yes.callback_data) && isDebtLinkCallback(no.callback_data))
    assert.deepEqual(parseDebtLinkCallback(yes.callback_data), { txId: tx, debtPrefix: "22222222" })
    assert.deepEqual(parseDebtLinkCallback(no.callback_data), { txId: tx, debtPrefix: null })
    assert.equal(parseDebtLinkCallback("dl:nope"), null)
  })
})
