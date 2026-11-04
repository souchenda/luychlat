import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { budgetCrossing } from "./budgets"
import { dictionaries } from "./i18n/dictionaries"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("A budget warning at the moment of spending (founder, 4/11/2026)", () => {
  it("said once when an entry crosses 70% and once when it crosses 100% — never on every entry after", () => {
    assert.deepEqual(budgetCrossing({ cap: 100, spentBefore: 60, added: 15 }), { status: "near", percent: 75 })
    assert.deepEqual(budgetCrossing({ cap: 100, spentBefore: 90, added: 20 }), { status: "over", percent: 110 })
    assert.deepEqual(budgetCrossing({ cap: 100, spentBefore: 50, added: 60 }), { status: "over", percent: 110 }) // both at once: «over»
    assert.equal(budgetCrossing({ cap: 100, spentBefore: 75, added: 5 }), null) // already near
    assert.equal(budgetCrossing({ cap: 100, spentBefore: 120, added: 5 }), null) // already over
    assert.equal(budgetCrossing({ cap: 100, spentBefore: 10, added: 5 }), null)
    assert.deepEqual(budgetCrossing({ cap: 100, spentBefore: 100, added: 1 }), { status: "over", percent: 101 }) // exactly at 100% is not over yet
    assert.equal(budgetCrossing({ cap: 0, spentBefore: 0, added: 5 }), null)
  })

  it("the app: a new expense of this month, after it is saved; the bot: after each new expense, numbers only with «ឱ្យ AI មើលលេខ»", () => {
    const sheet = read("src/components/transactions/entry-form-sheet.tsx")
    assert.match(sheet, /const cap = !transaction && type === "EXPENSE" \? budgets\?\.find\(\(b\) => b\.category_id === v\.categoryId\) : undefined/)
    assert.match(sheet, /if \(cap && monthTx && v\.date\.slice\(0, 7\) === monthKey\(\)\)/)
    const card = read("src/lib/server/entry-card.ts")
    assert.match(card, /const text = r\.numbers\n\s+\? tr\(lang, crossed\.status === "over" \? "budget\.crossOver" : "budget\.crossNear"/)
    assert.match(card, /: tr\(lang, crossed\.status === "over" \? "bot\.budgetOver" : "bot\.budgetNear", \{ category \}\)/)
    for (const l of ["km", "en"] as const) assert.doesNotMatch(dictionaries[l]["bot.budgetNear"] + dictionaries[l]["bot.budgetOver"], /\{percent\}|\d/) // no number without the switch
    assert.match(read("src/lib/server/bot-commands.ts"), /await budgetNudge\(chatId, savedTx\.id, lang\)/)
    assert.equal((read("src/lib/server/slip-bot.ts").match(/await budgetNudge\(/g) ?? []).length, 2)
    const sql = read("supabase/migrations/20270288000000_bot_budget_check.sql")
    assert.match(sql, /m\.user_id = link\.uid/) // a member of the workspace only
    assert.match(sql, /if t\.transaction_date < v_month then/) // this month only
  })
})
