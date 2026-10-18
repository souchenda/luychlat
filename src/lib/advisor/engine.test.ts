import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Category, Debt, Transaction, Wallet } from "@/lib/data/types"
import { dictionaries } from "@/lib/i18n/dictionaries"

import { answer, clarifyReply, matchIntent, monthlySurplus, resolveIntent, type Intent } from "./engine"
import { toAnonymousPayload } from "./payload"
import { computeSnapshot } from "./snapshot"

// The founder's test (18/10/2026, 5105.jpg): last month had income but no expense recorded; this month has
// spending ($385, $352, $298…); three loans. The two questions got the same generic block and «spending $0.00».
const TODAY = "2026-10-18"
const tx = (id: string, type: "INCOME" | "EXPENSE", amount: number, date: string, category: string) =>
  ({ id, type, amount, currency: "USD", transaction_date: `${date}T10:00:00`, category_id: category }) as unknown as Transaction
const cat = (id: string, preset: string) => ({ id, preset_key: preset, name: preset, type: "EXPENSE" }) as unknown as Category
const debt = (id: string, party: string, total: number, rate: number, due: string) =>
  ({ id, type: "PAYABLE", party_name: party, total_amount: total, paid_amount: 0, currency: "USD", due_date: due, interest_rate: rate, interest_period: "YEAR" }) as unknown as Debt

const { snapshot, labels } = computeSnapshot({
  workspaceType: "PERSONAL",
  wallets: [{ id: "w", balance: 900, currency: "USD", archived_at: null } as unknown as Wallet],
  transactions: [
    tx("i1", "INCOME", 1200, "2026-09-05", "c-salary"),
    tx("i2", "INCOME", 1200, "2026-10-05", "c-salary"),
    tx("e1", "EXPENSE", 385, "2026-10-06", "c-food"),
    tx("e2", "EXPENSE", 352, "2026-10-09", "c-rent"),
    tx("e3", "EXPENSE", 298, "2026-10-12", "c-transport"),
  ],
  categories: [cat("c-salary", "salary"), cat("c-food", "food"), cat("c-rent", "rent"), cat("c-transport", "transport")],
  debts: [debt("d1", "ACLEDA", 4000, 18, "2027-10-18"), debt("d2", "Sok", 300, 0, "2027-01-18"), debt("d3", "PPCBank", 1500, 24, "2027-04-18")],
  khrPerUsd: 4100,
  categoryLabel: (c) => c.name,
  today: TODAY,
})

const ask = (q: string, previous: Intent | null = null) => {
  const r = resolveIntent(q, previous)
  return r === "clarify" ? clarifyReply("km") : answer(r, snapshot, labels, "km")
}
const km = dictionaries.km

describe("AI advisor (offline) — every question answered on its subject (founder, 18/10/2026)", () => {
  it("the founder's questions reach their subject, whatever the spelling (ផ្តើម / ផ្ដើម, zero-width spaces)", () => {
    assert.equal(matchIntent("តើខ្ញុំគួរចាប់ផ្តើមពីផែនការណា?"), "plan")
    assert.equal(matchIntent("តើ​ខ្ញុំ​គួរ​ចាប់ផ្ដើម​ពី​ផែនការ​ណា?"), "plan")
    assert.equal(matchIntent("តើខ្ញុំគួរចាត់ចែងបំណុលរបៀបណា?"), "debt_first")
    assert.equal(matchIntent("តើខ្ញុំមានលុយសល់ប៉ុន្មានសម្រាប់សន្សំ?"), "surplus")
  })
  it("the five suggested chips each reach their own subject", () => {
    assert.equal(matchIntent(km["advisor.chip.score"]), "improve_score")
    assert.equal(matchIntent(km["advisor.chip.debtFirst"]), "debt_first")
    assert.equal(matchIntent(km["advisor.chip.month"]), "month_status")
    assert.equal(matchIntent(km["advisor.chip.shortfall"]), "shortfall")
    assert.equal(matchIntent(km["advisor.chip.save"]), "save_tips")
  })
  it("no two questions get the same answer", () => {
    const questions = [
      "តើខ្ញុំគួរចាប់ផ្តើមពីផែនការណា?",
      "តើខ្ញុំមានលុយសល់ប៉ុន្មានសម្រាប់សន្សំ?",
      km["advisor.chip.score"],
      km["advisor.chip.debtFirst"],
      km["advisor.chip.month"],
      km["advisor.chip.shortfall"],
      km["advisor.chip.save"],
    ]
    const answers = questions.map((q) => ask(q))
    assert.equal(new Set(answers).size, answers.length)
  })
  it("«which plan first?»: Snowball vs Avalanche on the real loans, and the one to clear first for relief", () => {
    const a = ask("តើខ្ញុំគួរចាប់ផ្តើមពីផែនការណា?")
    assert.match(a, /Snowball/)
    assert.match(a, /Avalanche/)
    assert.match(a, /^\*\*ជំហានដំបូង: ផែនការសងបំណុល\*\*/)
    assert.match(a, /1\. សងផ្ដាច់ «Sok» \(\$300\.00\) មុនគេ/) // the smallest balance, for relief
    assert.match(a, /PPCBank \(24%\/ឆ្នាំ\) → ACLEDA \(18%\/ឆ្នាំ\)/) // then the highest interest
    // «manage my debts» gets the full comparison — not the same text as the plan
    const debts = ask("តើខ្ញុំគួរចាត់ចែងបំណុលរបៀបណា?")
    assert.notEqual(debts, a)
    assert.match(debts, /Snowball \(តូចមុន\): \d+ ខែ/)
  })
  it("«how much is left to save?»: income − real spending − repayments; never «spending $0»", () => {
    assert.ok(snapshot.avgExpense > 0, "this month's spending counts when no previous month has expenses")
    assert.equal(snapshot.basis.expense, "this_month_projected")
    assert.equal(snapshot.basis.income, "history")
    const a = ask("តើខ្ញុំមានលុយសល់ប៉ុន្មានសម្រាប់សន្សំ?")
    assert.doesNotMatch(a, /ចំណាយ: −\$0\.00/)
    assert.match(a, /ចំណាយ: −\$[\d,]+\.\d\d \(ខែនេះ ប៉ាន់ស្មានពេញខែ\)/)
    assert.match(a, /សងបំណុល \/ រំលស់: −\$/)
    assert.ok(/នៅសល់ -?\$[\d,]+\.\d\d/.test(a), a)
    assert.equal(monthlySurplus(snapshot), Math.round((snapshot.avgIncome - snapshot.avgExpense - snapshot.monthlyDebtService) * 100) / 100)
  })
  it("the overview says where each figure comes from (no $0 average beside this month's spending)", () => {
    const a = ask("សួស្តី")
    assert.match(a, /ចំណូល: \$1,200\.00\/ខែ \(មធ្យម ១? ?1 ខែមុន\)|ចំណូល: \$1,200\.00\/ខែ \(មធ្យម 1 ខែមុន\)/)
    assert.doesNotMatch(a, /\$0\.00\/ខែ \(ខែនេះ/)
  })
  it("memory: a follow-up stays on the subject; an unclear question is not answered with the same block again", () => {
    assert.equal(resolveIntent("ហេតុអ្វី?", "debt_first"), "debt_first")
    assert.equal(resolveIntent("why?", "surplus"), "surplus")
    assert.equal(resolveIntent("សួស្តី", null), "health")
    assert.equal(resolveIntent("សួស្តី", "health"), "clarify")
  })
  it("the snapshot sent to a live AI still passes the strict allowlist, with its basis", () => {
    const payload = toAnonymousPayload(snapshot)
    assert.equal(payload.basis.expense, "this_month_projected")
    assert.ok(!JSON.stringify(payload).includes("Sok"))
  })
})
