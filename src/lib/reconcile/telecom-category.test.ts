import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseEntry, type BotCategory } from "@/lib/bot/parse-entry"
import { bizCategory } from "@/lib/server/biz-slip-bot"

import { classifyLine } from "./classify"

const biz: BotCategory[] = [
  { id: "util", name: "ទឹកភ្លើង", type: "EXPENSE", preset_key: "utilities" },
  { id: "ops", name: "ចំណាយប្រតិបត្តិការ", type: "EXPENSE", preset_key: "operating" },
  { id: "misc", name: "ចំណាយផ្សេងៗ", type: "EXPENSE", preset_key: "other_expense" },
]

describe("telecom top-ups in a business → ចំណាយប្រតិបត្តិការ (never utilities, never other)", () => {
  it("statement importer", () => {
    for (const d of ["Bill Payment SMART AXIATA 010234567", "TOP UP Cellcard 012345678", "EZECOM internet bill"])
      assert.equal(classifyLine({ amount: -5, description: d }, { owners: [], business: true }).preset, "operating", d)
    // EDC and water stay utilities; a person's telecom stays their phone category.
    assert.equal(classifyLine({ amount: -50, description: "Bill Payment EDC 539-011685" }, { owners: [], business: true }).preset, "utilities")
    assert.equal(classifyLine({ amount: -5, description: "TOP UP SMART" }, { owners: [], business: false }).preset, "phone")
  })
  it("bank slips in the business group", () => {
    assert.equal(bizCategory("EXPENSE", "Smart Mobile", biz)?.id, "ops")
    assert.equal(bizCategory("EXPENSE", "Metfone top-up", biz)?.id, "ops")
    assert.equal(bizCategory("EXPENSE", "EDC bill", biz)?.id, "util")
    assert.equal(bizCategory("EXPENSE", "PPWSA", biz)?.id, "util")
  })
  it("typed entries to the bot", () => {
    const e = parseEntry("កាតទូរស័ព្ទ 5$", { wallets: [{ id: "w", name: "ABA DL USD", currency: "USD" }], categories: biz, debts: [], rate: 4000 })
    assert.ok(e.ok && e.kind === "EXPENSE")
    assert.equal(e.category?.id, "ops")
  })
})
