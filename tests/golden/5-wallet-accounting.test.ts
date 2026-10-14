// GOLDEN PATH 5 — Wallet accounting (exact money, riel rounding only where computed, loans and repayments).
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseEntry, type BotDebt } from "../../src/lib/bot/parse-entry"
import { liabilitiesUsd, remaining } from "../../src/lib/debts"
import { convert, roundMoney, roundRiel } from "../../src/lib/money"

const WALLETS = [{ id: "aba", name: "ABA Bank", icon: "aba", currency: "USD" as const, account_no: null }]
const CLC: BotDebt = { id: "22222222-bbbb-4bbb-8bbb-222222222222", type: "PAYABLE", party_name: "Cambodian Labor Care PLC", currency: "USD", remaining: 8009 }

describe("GOLDEN 5 · wallet accounting", () => {
  it("typed and bank amounts stay exact; riel is whole riel; dollars keep cents", () => {
    assert.equal(roundMoney(1250.505, "USD"), 1250.51)
    assert.equal(roundMoney(867_700.4, "KHR"), 867_700)
  })
  it("riel the app computes is rounded to 100 ៛ (Cambodian rounding)", () => {
    assert.equal(roundRiel(12_345), 12_300)
    assert.equal(roundRiel(12_350), 12_400)
  })
  it("conversion at the workspace rate, both ways", () => {
    assert.equal(convert(10, "USD", "KHR", 4000), 40_000)
    assert.equal(convert(40_000, "KHR", "USD", 4000), 10)
  })
  it("a loan's remaining balance and the liabilities in USD", () => {
    assert.equal(remaining({ total_amount: 8241, paid_amount: 232, currency: "USD" }), 8009)
    const debts = [
      { type: "PAYABLE" as const, status: "PARTIALLY_PAID" as const, total_amount: 8241, paid_amount: 232, currency: "USD" as const },
      { type: "PAYABLE" as const, status: "ACTIVE" as const, total_amount: 4_000_000, paid_amount: 0, currency: "KHR" as const },
      { type: "PAYABLE" as const, status: "SETTLED" as const, total_amount: 500, paid_amount: 500, currency: "USD" as const },
      { type: "RECEIVABLE" as const, status: "ACTIVE" as const, total_amount: 50, paid_amount: 0, currency: "USD" as const },
    ]
    assert.equal(liabilitiesUsd(debts, 4000), 8009 + 1000)
  })
  it("a repayment can never exceed what is left on the loan", () => {
    const r = parseEntry("សង Labor Care 9000$", { wallets: WALLETS, categories: [], debts: [CLC], rate: 4000 })
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.reason, "too_much")
    const ok = parseEntry("សង Labor Care 232$", { wallets: WALLETS, categories: [], debts: [CLC], rate: 4000 })
    assert.equal(ok.ok && ok.kind, "REPAY")
    assert.equal(ok.ok && ok.amount, 232)
  })
})
