import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { quickActions, SLIP_BOT_URL } from "./quick-actions"

const base = { editable: true, personal: true, islamic: false, walletCount: 3 }
const keys = (o: Parameters<typeof quickActions>[0]) => quickActions(o).map((a) => a.key)
const by = (k: string, o = base) => quickActions(o).find((a) => a.key === k)!

describe("home quick actions — nine essential actions, three a row (founder, 21/10/2026)", () => {
  it("daily cash · obligations · control, in the founder's order", () => {
    assert.deepEqual(keys(base), ["scan", "entry", "transfer", "loans", "goals", "bills", "budgets", "market", "export"])
    assert.deepEqual(
      quickActions(base).map((a) => dictionaries.km[a.label]),
      ["ស្កេនវិក្កយបត្រ", "កត់ត្រារហ័ស", "ផ្ទេរប្រាក់", "កម្ចី និង CBC", "គោលដៅសន្សំ", "វិក្កយបត្រប្រចាំខែ", "កញ្ចប់ថវិកា", "ទីផ្សារ និងហាងឆេង", "នាំចេញរបាយការណ៍"],
    )
  })
  it("no filler: rates, gold and fuel are one market hub (they are on the hero's ticker too)", () => {
    for (const o of [base, { ...base, islamic: true }, { ...base, editable: false }]) {
      const ks = keys(o) as string[]
      assert.ok(!ks.some((k) => ["rates", "fuel", "gold", "reports"].includes(k)), ks.join(","))
      assert.equal(ks.filter((k) => k === "market").length, 1)
    }
    assert.equal(by("market").href, "/market")
  })
  it("the ninth tile: the Islamic hub with Islamic Mode on, else the report export (Excel / PDF)", () => {
    assert.deepEqual([by("islamic", { ...base, islamic: true }).href, keys({ ...base, islamic: true }).at(-1)], ["/islamic", "islamic"])
    assert.deepEqual([by("export").href, keys(base).at(-1)], ["/reports#export", "export"])
    assert.ok(!keys(base).includes("islamic"))
    assert.ok(!keys({ ...base, islamic: true }).includes("export"))
    // A business without Islamic Mode gets the export too.
    assert.equal(keys({ ...base, personal: false }).at(-1), "export")
  })
  it("a viewer, who cannot record, gets the six look-up tiles (two full rows)", () => {
    assert.deepEqual(keys({ ...base, editable: false }), ["loans", "goals", "bills", "budgets", "market", "export"])
  })
  it("the CBC K-Score only in Personal; a business opens its loans", () => {
    assert.deepEqual([by("loans").label, by("loans").href], ["quick.loansCbc", "/debts?tab=PAYABLE#credit-health"])
    const biz = by("loans", { ...base, personal: false })
    assert.deepEqual([biz.label, biz.href], ["quick.loans", "/debts?tab=PAYABLE"])
  })
  it("a slip is scanned by the bot; quick entry opens the sheet (expense ⇄ income); transfer needs two wallets", () => {
    assert.deepEqual([by("scan").href, by("scan").external], [SLIP_BOT_URL, true])
    assert.equal(by("entry").href, undefined)
    assert.equal(by("transfer").disabled, false)
    assert.equal(by("transfer", { ...base, walletCount: 1 }).disabled, true)
    assert.deepEqual([by("goals").href, by("bills").href, by("budgets").href], ["/goals", "/bills", "/budgets"])
  })
  it("every label in three languages; Khmer says «និង», never «&», and uses no Khmer digits", () => {
    for (const a of [...quickActions(base), ...quickActions({ ...base, islamic: true, personal: false })]) {
      const km = dictionaries.km[a.label]
      assert.ok(km && dictionaries.en[a.label] && dictionaries.zh[a.label], a.label)
      assert.ok(!km.includes("&") && !/[០-៩]/.test(km), `${a.label}: ${km}`)
    }
  })
})
