import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { salarySaving, type SavingGoal } from "./salary-saving"

const TODAY = "2026-11-04"
const moto: SavingGoal = { id: "moto", name: "ទិញម៉ូតូ", currency: "USD", balance: 400, target: 1200, date: "2027-03-01", savedThisMonth: 0 }

describe("«💰 ប្រាក់ខែចូលហើយ» — a saving nudge when the salary comes in (founder, 4/11/2026)", () => {
  it("what the goal needs this month to reach its date (the goal card's figure): $800 over 4 months → $200", () => {
    assert.deepEqual(salarySaving({ income: { amount: 600, currency: "USD" }, goals: [moto], today: TODAY, khrPerUsd: 4000 }), {
      goalId: "moto",
      goalName: "ទិញម៉ូតូ",
      goalCurrency: "USD",
      toAmount: 200,
      fromAmount: 200,
      fromCurrency: "USD",
    })
  })

  it("less what was already put in this month; nothing when the month is covered", () => {
    assert.equal(salarySaving({ income: { amount: 600, currency: "USD" }, goals: [{ ...moto, savedThisMonth: 150 }], today: TODAY, khrPerUsd: 4000 })?.toAmount, 50)
    assert.equal(salarySaving({ income: { amount: 600, currency: "USD" }, goals: [{ ...moto, savedThisMonth: 200 }], today: TODAY, khrPerUsd: 4000 }), null)
  })

  it("the nearest date first; no date, a date passed or a goal reached → never suggested", () => {
    const soon: SavingGoal = { ...moto, id: "school", name: "ថ្លៃសាលាកូន", target: 500, balance: 300, date: "2026-12-15" }
    assert.equal(salarySaving({ income: { amount: 600, currency: "USD" }, goals: [moto, soon], today: TODAY, khrPerUsd: 4000 })?.goalId, "school")
    for (const g of [{ ...moto, date: null }, { ...moto, date: "2026-10-01" }, { ...moto, balance: 1200 }])
      assert.equal(salarySaving({ income: { amount: 600, currency: "USD" }, goals: [g], today: TODAY, khrPerUsd: 4000 }), null)
  })

  it("never more than the salary; a riel salary into a dollar goal at the rate, computed riel to 100 ៛", () => {
    assert.equal(salarySaving({ income: { amount: 120, currency: "USD" }, goals: [moto], today: TODAY, khrPerUsd: 4000 })?.fromAmount, 120)
    const r = salarySaving({ income: { amount: 2_000_000, currency: "KHR" }, goals: [moto], today: TODAY, khrPerUsd: 4085 })
    assert.equal(r?.toAmount, 200)
    assert.equal(r?.fromAmount, 817_000) // 200 × 4,085 = 817,000 ៛
    assert.equal(r!.fromAmount % 100, 0)
  })
})

describe("wired — the bot after a salary is saved, the app's form; moved only on the tap", () => {
  it("Personal only, a salary only; the transfer is made by the database on ✅, checked again then", async () => {
    const { readFileSync } = await import("node:fs")
    const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n")
    const sql = read("supabase/migrations/20270290000000_salary_saving_nudge.sql")
    assert.match(sql, /c\.preset_key = 'salary' and w\.type = 'PERSONAL'/)
    assert.match(sql, /if not p_accept then\n\s+update public\.savings_nudges set status = 'LATER'/)
    assert.match(sql, /m\.workspace_id = s\.workspace_id and m\.user_id = link\.uid/)
    assert.match(read("src/lib/server/bot-commands.ts"), /if \(r\.kind === "INCOME" && r\.tx_id\) void offerSalarySaving\(chatId, r\.tx_id, lang\)/)
    const sheet = read("src/components/transactions/entry-form-sheet.tsx")
    assert.match(sheet, /activeWorkspace\?\.type === "PERSONAL" && categoriesQuery\.data\?\.find\(\(c\) => c\.id === v\.categoryId\)\?\.preset_key === "salary"/)
    assert.equal((sheet.match(/walletMutations\.transfer/g) ?? []).length, 1) // inside the toast's action only
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /isSalarySavingCallback\(update\.callback_query\.data\)/)
  })
})
