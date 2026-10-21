import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { quickActions } from "./quick-actions"

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
  it("a slip is scanned in the app (no link out to Telegram); quick entry opens the sheet (expense ⇄ income); transfer needs two wallets", () => {
    assert.deepEqual([by("scan").href, by("scan").external], [undefined, undefined])
    assert.equal(by("entry").href, undefined)
    assert.equal(by("transfer").disabled, false)
    assert.equal(by("transfer", { ...base, walletCount: 1 }).disabled, true)
    assert.deepEqual([by("goals").href, by("bills").href, by("budgets").href], ["/goals", "/bills", "/budgets"])
  })
  it("every label in three languages; Khmer says «និង», never «&», and uses no Khmer digits", () => {
    for (const a of [...quickActions(base), ...quickActions({ ...base, islamic: true, personal: false }), ...quickActions({ ...base, personal: false, business: true })]) {
      const km = dictionaries.km[a.label]
      assert.ok(km && dictionaries.en[a.label] && dictionaries.zh[a.label], a.label)
      assert.ok(!km.includes("&") && !/[០-៩]/.test(km), `${a.label}: ${km}`)
    }
  })
})

describe("the Business grid — merchant operations (founder, 21/10/2026 — Task #438)", () => {
  const biz = { ...base, personal: false, business: true }
  it("scan · sales / income · general expense | transfer · customers owe · we owe | monthly bills · market · export", () => {
    assert.deepEqual(keys(biz), ["scan", "income", "expense", "transfer", "receivable", "payable", "bills", "market", "export"])
    assert.deepEqual(
      quickActions(biz).map((a) => dictionaries.km[a.label]),
      ["ស្កេនវិក្កយបត្រ", "លក់ដាច់/ចំណូល", "ចំណាយទូទៅ", "ផ្ទេរប្រាក់", "អតិថិជនជំពាក់ (AR)", "ជំពាក់គេ (AP)", "វិក្កយបត្រប្រចាំខែ", "ទីផ្សារ NBC/សាំង", "នាំចេញរបាយការណ៍"],
    )
    assert.deepEqual([by("receivable", biz).href, by("payable", biz).href, by("market", biz).href, by("export", biz).href], ["/business/ar", "/business/ap", "/market", "/reports#export"])
    // No savings goals or budgets in the merchant grid; no Islamic tile (the menu keeps it); the sheets have no href.
    for (const k of ["goals", "budgets", "islamic", "loans"]) assert.ok(!keys({ ...biz, islamic: true }).includes(k as never), k)
    for (const k of ["scan", "income", "expense", "transfer"]) assert.equal(by(k, biz).href, undefined, k)
    assert.equal(by("transfer", { ...biz, walletCount: 1 }).disabled, true)
  })
  it("a viewer looks, never records: no scan, entry or transfer tiles", () => {
    assert.deepEqual(keys({ ...biz, editable: false }), ["receivable", "payable", "bills", "market", "export"])
  })
  it("wired: «លក់ដាច់/ចំណូល» opens the entry sheet on income, «ចំណាយទូទៅ» on expense; Personal keeps its own grid", async () => {
    const { readFileSync } = await import("node:fs")
    const grid = readFileSync("src/components/dashboard/quick-actions.tsx", "utf8")
    assert.match(grid, /a\.key === "income" && onIncome \? onIncome : onEntry/)
    const home = readFileSync("src/app/(app)/home/page.tsx", "utf8")
    assert.match(home, /business: workspace\?\.type === "BUSINESS"/)
    assert.match(home, /onIncome=\{\(\) => setEntryType\("INCOME"\)\}/)
    assert.deepEqual(keys(base), ["scan", "entry", "transfer", "loans", "goals", "bills", "budgets", "market", "export"])
  })
})
