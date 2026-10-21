import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { Debt } from "@/lib/data/types"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { quickActions } from "@/lib/quick-actions"

import { arApSummary, arReminderText, openDebts, overdueDays } from "./ar-ap"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const TODAY = "2026-10-22"
let n = 0
const debt = (o: Partial<Debt> & Pick<Debt, "type" | "party_name" | "total_amount">): Debt =>
  ({ id: `d${++n}`, workspace_id: "biz", paid_amount: 0, currency: "USD", due_date: null, status: "ACTIVE", interest_rate: 0, interest_period: "MONTH", start_date: "2026-10-01", note: null, created_at: "x", contact_phone: null, disbursement_transaction_id: null, ...o }) as Debt

const book = [
  debt({ type: "RECEIVABLE", party_name: "ហាងបាយ សុខា", total_amount: 120, paid_amount: 20, due_date: "2026-10-17" }), // $100 left, 5 days late
  debt({ type: "RECEIVABLE", party_name: "Stall 12", total_amount: 400_000, currency: "KHR", due_date: "2026-10-25" }), // $100 at 4,000
  debt({ type: "RECEIVABLE", party_name: "ហាងបាយ សុខា", total_amount: 30, due_date: null }), // the same customer again
  debt({ type: "RECEIVABLE", party_name: "Paid up", total_amount: 50, paid_amount: 50, due_date: "2026-10-01" }), // settled: never listed
  debt({ type: "PAYABLE", party_name: "កសិដ្ឋាន ជ្រូក", total_amount: 800, paid_amount: 300, due_date: "2026-10-27" }), // due this week
  debt({ type: "PAYABLE", party_name: "Feed supplier", total_amount: 1_000_000, currency: "KHR", due_date: "2026-11-30" }),
]

describe("AR / AP for a business (founder, 22/10/2026 — Task #453)", () => {
  it("AR: what customers still owe, what is overdue, how many customers — settled ones left out, the most urgent first", () => {
    assert.deepEqual(arApSummary(book, "RECEIVABLE", 4000, TODAY), { totalUsd: 230, overdueUsd: 100, overdueCount: 1, dueWeekUsd: 100, count: 2 })
    assert.deepEqual(openDebts(book, "RECEIVABLE").map((d) => d.party_name), ["ហាងបាយ សុខា", "Stall 12", "ហាងបាយ សុខា"])
    assert.equal(overdueDays(book[0], TODAY), 5)
    assert.equal(overdueDays(book[1], TODAY), null)
    assert.equal(dictionaries.km["arap.overdueDays"].replace("{n}", "5"), "ហួសកំណត់ 5 ថ្ងៃ")
  })
  it("AP: what we owe suppliers and what falls due in the next 7 days", () => {
    const ap = arApSummary(book, "PAYABLE", 4000, TODAY)
    assert.deepEqual([ap.totalUsd, ap.dueWeekUsd, ap.overdueUsd], [750, 500, 0])
  })
  it("the reminder: the founder's words, what is LEFT in the debt's own currency; «អាស្សាឡាមុអាឡៃកុម» in Islamic Mode", () => {
    assert.equal(
      arReminderText({ customer: "ហាងបាយ សុខា", business: "DL MEAT SUPPLY", debt: book[0] }),
      "ជម្រាបសួរ ហាងបាយ សុខា! ពីហាង DL MEAT SUPPLY។ នេះជាការរំលឹកអំពីវិក្កយបត្រថ្លៃទំនិញសរុប $100.00 ដែលដល់ថ្ងៃទូទាត់។ បងអាចផ្ញើវិក្កយបត្រ ឬទូទាត់តាមគណនីបានដោយងាយស្រួល។ អរគុណច្រើនបង! 🙏",
    )
    assert.match(arReminderText({ customer: "Stall 12", business: "DL", debt: book[1] }), /សរុប 400,000៛ ដែល/)
    assert.match(arReminderText({ customer: "x", business: "y", debt: book[0], islamic: true }), /^អាស្សាឡាមុអាឡៃកុម x! /)
    assert.doesNotMatch(arReminderText({ customer: "x", business: "y", debt: book[0] }), /កម្មវិធី|&/)
  })
  it("wired: the Business grid's AR / AP tiles open the new pages; the page records payments with the debt's own repayment", () => {
    const biz = quickActions({ editable: true, personal: false, business: true, islamic: false, walletCount: 3 })
    assert.equal(biz.find((a) => a.key === "receivable")?.href, "/business/ar")
    assert.equal(biz.find((a) => a.key === "payable")?.href, "/business/ap")
    assert.match(read("src/app/(app)/business/ar/page.tsx"), /<ArApView kind="RECEIVABLE" \/>/)
    assert.match(read("src/app/(app)/business/ap/page.tsx"), /<ArApView kind="PAYABLE" \/>/)
    const view = read("src/components/business/ar-ap-view.tsx")
    assert.match(view, /<RepaymentSheet open=\{Boolean\(paying\)\}/) // record_debt_repayment: the wallet moves, never past what is left
    assert.match(view, /if \(workspace && workspace\.type !== "BUSINESS"\) return/) // Business only (workspace isolation)
    assert.match(view, /\{ar && \(\s*<Button[^>]*onClick=\{\(\) => remind\(d\)\}/) // the reminder on AR only
    for (const l of ["en", "zh"] as const) assert.ok((dictionaries[l] as Record<string, string>)["arap.ap.total"], l)
  })
})
