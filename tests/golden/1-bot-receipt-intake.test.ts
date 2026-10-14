// GOLDEN PATH 1 — Bot receipt intake. Locks behaviour the founder confirmed; never weaken these.
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanSlip, resolveWallet } from "../../src/lib/bot/bank-slip"
import { isPaidMessage, matchPayableDebt } from "../../src/lib/bot/debt-match"
import { parseEntry, type BotDebt } from "../../src/lib/bot/parse-entry"

const WALLETS = [
  { id: "aba-usd", name: "ABA Bank", icon: "aba", currency: "USD" as const, account_no: "078824222" },
  { id: "ac-016", name: "អេស៊ីលីដា 016***4222 USD", icon: "acleda", currency: "USD" as const, account_no: "016824222" },
  { id: "ac-khr", name: "អេស៊ីលីដា KHR", icon: "acleda", currency: "KHR" as const, account_no: "078824222" },
]
const DEBTS: BotDebt[] = [
  { id: "22222222-bbbb-4bbb-8bbb-222222222222", type: "PAYABLE", party_name: "Cambodian Labor Care PLC", currency: "USD", remaining: 8009 },
  { id: "11111111-aaaa-4aaa-8aaa-111111111111", type: "PAYABLE", party_name: "PPCBank កម្ចីផ្ទះ 35 (1-224-00006341-4)", currency: "USD", remaining: 38000 },
  { id: "33333333-cccc-4ccc-8ccc-333333333333", type: "PAYABLE", party_name: "PPCBank · New Car Loan to Individual-USD", currency: "USD", remaining: 16506.21 },
]

describe("GOLDEN 1 · bot receipt intake", () => {
  it("a slip's amount is read exactly; a number taken from the time is refused, never booked", () => {
    const read = { is_slip: true, amount: -232, currency: "USD", direction: "OUT", bank: "ABA BANK", date: "2026-10-13", time: "12:13 PM", party: "CAMBODIAN LABOR CARE PLC", account: "016 824 222" }
    assert.equal(cleanSlip(read)!.amount, 232)
    assert.equal(cleanSlip({ ...read, amount: 12, time: "12:13 PM" }), null)
  })
  it("never another bank's wallet by number alone: an ABA slip from a number saved on ACLEDA asks", () => {
    const pick = resolveWallet({ bank: "ABA BANK", currency: "USD", account: "016824222" }, WALLETS)
    assert.ok(pick && "choices" in pick, "must ask, not book")
    assert.equal(pick.choices[0].id, "aba-usd")
  })
  it("never a USD wallet for a riel slip, never a silent default", () => {
    const pick = resolveWallet({ bank: "Wing", currency: "KHR", account: null }, WALLETS)
    assert.ok(!pick || "choices" in pick || pick.wallet.currency === "KHR")
  })
  it("a payee that is a loan is recognised (CLC); two PPCBank loans are never guessed between", () => {
    assert.equal(matchPayableDebt("CAMBODIAN LABOR CARE PLC", DEBTS)?.party_name, "Cambodian Labor Care PLC")
    assert.equal(matchPayableDebt("ppcbank paid", DEBTS), null)
  })
  it("«clc paid» is a payment, not an expense with no amount", () => {
    assert.equal(isPaidMessage("clc paid"), true)
    assert.equal(matchPayableDebt("បង់ clc", DEBTS)?.party_name, "Cambodian Labor Care PLC")
  })
  it("a typed entry: «កាហ្វេ 2$» is a $2 expense", () => {
    const r = parseEntry("កាហ្វេ 2$", { wallets: WALLETS, categories: [], debts: DEBTS, rate: 4000 })
    assert.ok(r.ok)
    assert.equal(r.ok && r.kind, "EXPENSE")
    assert.equal(r.ok && r.amount, 2)
    assert.equal(r.ok && r.currency, "USD")
  })
})
