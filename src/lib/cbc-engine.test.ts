import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MonthCell } from "@/lib/loans/cbc"

import { assessCredit, averageMonthlyIncome, cbcVerdict, gradeBadge, incomeLastMonths, monthlyPaymentUsd, VERDICT_A, type LoanHistory } from "./cbc-engine"

/** 24 months, oldest first, from a string of codes («0» on time, «1» «2» «3» late, «Q» nothing due, «X» before the loan…). */
const strip = (codes: string[]): MonthCell[] =>
  codes.map((code, i) => {
    const d = new Date(Date.UTC(2024, 10 + i, 1))
    const month = d.toISOString().slice(0, 7)
    return { month, label: `M${i + 1}`, code: code === "3" ? "3+" : code, tier: "good", due: null }
  })
const loan = (codes: string, monthlyPaymentUsd: number | null = 100): LoanHistory => ({ months: strip(codes.split("")), monthlyPaymentUsd })
const clean = "0".repeat(24)

describe("CBC credit health engine (founder, 21/10/2026)", () => {
  it("Grade A: every month on time and DTI under 40% — 24/24 (100%) and the founder's verdict", () => {
    const a = assessCredit([loan(clean, 300)], 1000)
    assert.equal(a.grade, "A")
    assert.deepEqual([a.onTime, a.counted, a.rate, a.streak], [24, 24, 100, 24])
    assert.equal(a.dti, 30)
    assert.equal(gradeBadge("A"), "🟢 សុខភាពឥណទាន៖ ល្អឥតខ្ចោះ (Grade A)")
    assert.deepEqual(cbcVerdict(a), [VERDICT_A])
  })

  it("DTI weighting: the debt payments of every loan over the average income — 40–50% is B, over 50% C", () => {
    assert.equal(assessCredit([loan(clean, 250), loan(clean, 200)], 1000).dti, 45)
    assert.equal(assessCredit([loan(clean, 250), loan(clean, 200)], 1000).grade, "B")
    assert.equal(assessCredit([loan(clean, 300), loan(clean, 250)], 1000).grade, "C")
    assert.equal(assessCredit([loan(clean, 399)], 1000).grade, "A") // 39.9%
    assert.equal(assessCredit([loan(clean, 400)], 1000).grade, "B") // 40% exactly
    // A paid-off or unscheduled loan costs nothing a month.
    assert.equal(assessCredit([loan(clean, null), loan(clean, 100)], 1000).monthlyDebtUsd, 100)
    assert.match(cbcVerdict(assessCredit([loan(clean, 600)], 1000)).join(" "), /បន្ទុកបំណុល 60% នៃចំណូល — ខ្ពស់ពេក/)
  })

  it("no income recorded: DTI unknown, graded on the history alone — and said so", () => {
    const a = assessCredit([loan(clean)], null)
    assert.equal(a.dti, null)
    assert.equal(a.grade, "A")
    assert.match(cbcVerdict(a).at(-1)!, /DTI\) មិនទាន់គណនាបាន/)
    assert.equal(averageMonthlyIncome([0, 0, 0]), null)
    assert.equal(averageMonthlyIncome([900, 1000, 1100]), 1000)
  })

  it("grades by the worst lateness: 1–2 minor lates B, a 30–59 day late C, 3+ minor lates C, 60+ days D", () => {
    assert.equal(assessCredit([loan("0".repeat(20) + "1000")], 2000).grade, "B")
    assert.equal(assessCredit([loan("0".repeat(18) + "1010" + "00")], 2000).grade, "B")
    assert.equal(assessCredit([loan("1".repeat(3) + "0".repeat(21))], 2000).grade, "C")
    assert.equal(assessCredit([loan("0".repeat(10) + "2" + "0".repeat(13))], 2000).grade, "C")
    assert.equal(assessCredit([loan("3" + "0".repeat(23))], 2000).grade, "D")
  })

  it("every loan together: a month is as late as its latest loan", () => {
    const a = assessCredit([loan(clean), loan("0".repeat(23) + "2")], 5000)
    assert.equal(a.months.at(-1)!.code, "2")
    assert.equal(a.grade, "C")
    assert.equal(a.loans, 2)
  })

  it("streak counting: on-time months back from now — «nothing due» neither counts nor breaks it, a late month ends it", () => {
    assert.equal(assessCredit([loan("0".repeat(14) + "1" + "0000Q0000")], 2000).streak, 8)
    assert.equal(assessCredit([loan("X".repeat(20) + "0000")], 2000).streak, 4)
    // Only the months with a recorded payment count; «✓» (date not recorded) does not.
    const a = assessCredit([loan("X".repeat(12) + "✓✓✓✓" + "00000000")], 2000)
    assert.deepEqual([a.counted, a.unknownPaid, a.rate], [8, 4, 100])
  })

  it("the way back to green: on-time months in a row until the latest late month leaves the 24-month window", () => {
    // Late at position 14 of 24 (0 = oldest): it rolls out after 15 more months.
    const a = assessCredit([loan("0".repeat(14) + "1" + "0".repeat(9))], 3000)
    assert.equal(a.lastLate!.label, "M15")
    assert.equal(a.monthsToClear, 15)
    assert.match(cbcVerdict(a).join("\n"), /បើបង់ទាន់ពេលជាប់គ្នា 15 ខែទៀត ការសងយឺតចុងក្រោយ \(M15\) នឹងរំកិលចេញពីប្រវត្តិ 24 ខែ/)
    // Late this month: 24 more. The oldest month: 1 more.
    assert.equal(assessCredit([loan("0".repeat(23) + "2")], 3000).monthsToClear, 24)
    assert.equal(assessCredit([loan("1" + "0".repeat(23))], 3000).monthsToClear, 1)
    assert.equal(assessCredit([loan(clean)], 3000).monthsToClear, 0)
  })

  it("the verdict names each lateness, warns of an overdue payment first, and has no data without payments", () => {
    const a = assessCredit([loan("0".repeat(10) + "1" + "0".repeat(5) + "2" + "0".repeat(6) + "3")], 3000, true)
    const v = cbcVerdict(a)
    assert.match(v[0], /^⚠️ មានការបង់ហួសកំណត់ឥឡូវនេះ/)
    assert.match(v[1], /យឺតក្រោម 30 ថ្ងៃ 1 ខែ · យឺត 30–59 ថ្ងៃ 1 ខែ · យឺត 60 ថ្ងៃឡើងទៅ 1 ខែ/)
    assert.equal(a.grade, "D")
    const none = assessCredit([loan("X".repeat(24))], 3000)
    assert.equal(none.grade, null)
    assert.match(cbcVerdict(none)[0], /មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់/)
    assert.equal(assessCredit([], 3000).grade, null)
  })

  it("Khmer copy: «និង», never «&»; international digits", () => {
    const v = cbcVerdict(assessCredit([loan("0".repeat(14) + "2" + "0".repeat(9), 450)], 1000)).join(" ")
    assert.doesNotMatch(v, /&|[០-៩]|កម្មវិធី|អែប/)
  })

  it("income for the DTI: the last 3 complete months of earnings — never a loan received, a tontine pot or capital put in", () => {
    const cats = [
      { id: "salary", preset_key: "salary" },
      { id: "loan", preset_key: null },
      { id: "pot", preset_key: "tontine_payout" },
      { id: "capital", preset_key: "investment" },
    ]
    const tx = (date: string, amount: number, category_id: string, currency = "USD", type = "INCOME") => ({ type, amount, currency, category_id, transaction_date: `${date}T09:00:00Z` })
    const rows = [
      tx("2026-07-25", 800, "salary"),
      tx("2026-08-25", 800, "salary"),
      tx("2026-09-25", 800, "salary"),
      tx("2026-09-10", 400_000, "salary", "KHR"), // 100 USD at 4,000
      tx("2026-09-12", 5000, "pot"),
      tx("2026-09-12", 3000, "capital"),
      tx("2026-10-01", 800, "salary"), // this month: not complete, not counted
      tx("2026-06-25", 800, "salary"), // four months back
      tx("2026-09-20", 50, "salary", "USD", "EXPENSE"),
    ]
    assert.deepEqual(incomeLastMonths(rows, cats, 4000, "2026-10-21"), [800, 800, 900])
    assert.equal(averageMonthlyIncome(incomeLastMonths(rows, cats, 4000, "2026-10-21")), 833.33)
    // January looks back across the year.
    assert.deepEqual(incomeLastMonths([tx("2025-12-05", 100, "salary")], cats, 4000, "2026-01-15"), [0, 0, 100])
  })

  it("a loan's monthly cost: its next unpaid installment; weekly × 52 ÷ 12; riel at the rate; paid off → nothing", () => {
    const rows = [{ payment: 120, status: "PAID" }, { payment: 118.5, status: "OVERDUE" }, { payment: 118.5, status: "PENDING" }]
    assert.equal(monthlyPaymentUsd(rows, "MONTHLY", "USD", 4000), 118.5)
    assert.equal(monthlyPaymentUsd([{ payment: 30, status: "DUE" }], "WEEKLY", "USD", 4000), 130)
    assert.equal(monthlyPaymentUsd([{ payment: 400_000, status: "DUE" }], "MONTHLY", "KHR", 4000), 100)
    assert.equal(monthlyPaymentUsd([{ payment: 10, status: "PAID" }], "MONTHLY", "USD", 4000), null)
  })

  it("the modal shows the real assessment first — badge, metrics, the 24 months together, the bank's verdict — the codes below", async () => {
    const React = await import("react")
    ;(globalThis as unknown as { React: typeof React }).React = React // the test runner's classic JSX
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { CbcAssessmentView } = await import("../components/loans/cbc-health-modal")
    const html = (a: ReturnType<typeof assessCredit>, unscheduled = 0) => renderToStaticMarkup(React.createElement(CbcAssessmentView, { a, unscheduled }))
    const good = html(assessCredit([loan(clean, 300)], 1000), 1)
    for (const s of ["🟢 សុខភាពឥណទាន៖ ល្អឥតខ្ចោះ (Grade A)", "អត្រាសងទៀងទាត់", ">100%<", "24/24 ខែ", "បន្ទុកបំណុល (DTI)", ">30%<", "សេចក្តីសន្និដ្ឋានរបស់ធនាគារ", VERDICT_A, "កម្ចី 1 គ្មានតារាងបង់ មិនបានរាប់", "មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ", "ឯកសារយោង៖ កូដ CBC"])
      assert.ok(good.includes(s), s)
    const late = html(assessCredit([loan("0".repeat(14) + "1" + "0".repeat(9), 300)], null))
    assert.ok(late.includes("🟡 សុខភាពឥណទាន៖ ល្អ — ត្រូវប្រុងប្រយ័ត្ន (Grade B)"))
    assert.ok(late.includes("បើបង់ទាន់ពេលជាប់គ្នា 15 ខែទៀត"))
    assert.ok(late.includes("គ្មានចំណូលកត់ត្រា 3 ខែចុងក្រោយ"))
    assert.match(html(assessCredit([], 1000)), /មិនទាន់មានកម្ចីដែលមានតារាងបង់/)
    assert.doesNotMatch(good + late, /&amp;|[០-៩]/) // «និង», international digits
  })
})
