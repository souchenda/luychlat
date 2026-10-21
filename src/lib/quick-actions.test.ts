import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { quickActions, SLIP_BOT_URL } from "./quick-actions"

const base = { editable: true, personal: true, islamic: false, walletCount: 3 }
const keys = (o: Parameters<typeof quickActions>[0]) => quickActions(o).map((a) => a.key)

describe("home quick actions — three a row under the hero (founder, 21/10/2026)", () => {
  it("nine tiles in the founder's order: recording, money tools, market", () => {
    assert.deepEqual(keys(base), ["scan", "entry", "transfer", "loans", "reports", "bills", "rates", "fuel", "gold"])
  })
  it("the Islamic hub only with Islamic Mode on — it takes the bills' slot, never shown to everyone", () => {
    assert.deepEqual(keys({ ...base, islamic: true }).slice(3, 6), ["loans", "reports", "islamic"])
    assert.ok(!keys(base).includes("islamic"))
  })
  it("a viewer, who cannot record, gets the six look-up tiles (two full rows)", () => {
    assert.deepEqual(keys({ ...base, editable: false }), ["loans", "reports", "bills", "rates", "fuel", "gold"])
  })
  it("the CBC K-Score only in Personal; a business opens its loans", () => {
    const loans = (personal: boolean) => quickActions({ ...base, personal }).find((a) => a.key === "loans")!
    assert.deepEqual([loans(true).label, loans(true).href], ["quick.loansCbc", "/debts?tab=PAYABLE#credit-health"])
    assert.deepEqual([loans(false).label, loans(false).href], ["quick.loans", "/debts?tab=PAYABLE"])
  })
  it("a slip is scanned by the bot; transfer needs two wallets; fuel and gold open their sections on /market", () => {
    const by = (k: string, o = base) => quickActions(o).find((a) => a.key === k)!
    assert.deepEqual([by("scan").href, by("scan").external], [SLIP_BOT_URL, true])
    assert.equal(by("transfer").disabled, false)
    assert.equal(by("transfer", { ...base, walletCount: 1 }).disabled, true)
    assert.equal(by("fuel").href, "/market#fuel")
    assert.equal(by("gold").href, "/market#gold")
  })
  it("Khmer labels say «និង», never «&» (copy standard)", async () => {
    const { dictionaries } = await import("@/lib/i18n/dictionaries")
    for (const a of quickActions({ ...base, islamic: true })) assert.ok(!dictionaries.km[a.label].includes("&"), a.label)
  })
})
