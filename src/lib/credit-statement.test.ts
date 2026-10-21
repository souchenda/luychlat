import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assessCredit, type LoanHistory } from "@/lib/cbc-engine"
import type { MonthCell } from "@/lib/loans/cbc"

import { buildStatement, dtiBand, formatDti, SOFT_CHECK_DISCLAIMER, statementDate, statementShareText } from "./credit-statement"

const strip = (codes: string): MonthCell[] =>
  codes.split("").map((code, i) => ({ month: `2025-${String((i % 12) + 1).padStart(2, "0")}`, label: `M${i + 1}`, code: code === "3" ? "3+" : code, tier: "good", due: null }))
const loan = (codes: string, monthlyPaymentUsd: number | null): LoanHistory => ({ months: strip(codes), monthlyPaymentUsd })
const who = { name: "ស៊ូ ចិន្តា", workspace: "ផ្ទាល់ខ្លួន", today: "2026-10-21" }

describe("pre-loan assessment statement (founder, 21/10/2026)", () => {
  it("the DTI with its safety benchmark: under 40% safe, 40–50% watch, over 50% high — or why there is none", () => {
    assert.deepEqual([dtiBand(39.9), dtiBand(40), dtiBand(50), dtiBand(50.1), dtiBand(null)], ["safe", "watch", "watch", "high", null])
    assert.equal(formatDti(30), "30% · ក្រោម 40% — សុវត្ថិភាព")
    assert.equal(formatDti(44.6), "44.6% · 40–50% — ត្រូវប្រុងប្រយ័ត្ន")
    assert.equal(formatDti(61), "61% · លើស 50% — ខ្ពស់")
    assert.equal(formatDti(null), "— (គ្មានចំណូលកត់ត្រា 3 ខែចុងក្រោយ)")
  })

  it("the statement's figures: the grade, the 24-month rate, active loans, installments against income", () => {
    const a = assessCredit([loan("0".repeat(24), 285.5), loan("0".repeat(24), null), loan("XXXX" + "0".repeat(20), 64.5)], 1000)
    const s = buildStatement(a, who)
    assert.equal(s.date, "21 តុលា 2026")
    assert.equal(s.gradeLabel, "Grade A · ល្អឥតខ្ចោះ")
    assert.deepEqual([s.rate, s.rateDetail], ["100%", "24/24 ខែ បង់ទាន់ពេល"])
    assert.deepEqual([s.activeLoans, s.loans], [2, 3]) // the paid-off loan is recorded, not active
    assert.equal(s.installments, "$350.00 / ខែ")
    assert.equal(s.income, "$1,000.00 / ខែ")
    assert.equal(s.dti, "35% · ក្រោម 40% — សុវត្ថិភាព")
    assert.equal(s.months.length, 24)
  })

  it("without income or payments: the gaps are said, never filled", () => {
    const s = buildStatement(assessCredit([loan("X".repeat(24), 100)], null), who)
    assert.deepEqual([s.grade, s.gradeLabel, s.rate, s.income], [null, "មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់", "—", "—"])
    assert.match(s.dti, /គ្មានចំណូលកត់ត្រា/)
  })

  it("the share text carries the same figures and the founder's soft-check disclaimer, word for word", () => {
    const text = statementShareText(buildStatement(assessCredit([loan("0".repeat(23) + "1", 300)], 1000), who))
    for (const line of ["📄 របាយការណ៍វាយតម្លៃសមត្ថភាពឥណទានបឋម · អេប លុយឆ្លាត", "ស៊ូ ចិន្តា · 21 តុលា 2026", "Grade B", "96% (23/24 ខែ បង់ទាន់ពេល)", "កម្ចីកំពុងសង៖ 1", "$300.00 / ខែ", "30% · ក្រោម 40% — សុវត្ថិភាព"])
      assert.ok(text.includes(line), line)
    assert.ok(text.endsWith(SOFT_CHECK_DISCLAIMER))
    assert.match(SOFT_CHECK_DISCLAIMER, /ដោយមិនប៉ះពាល់ដល់ពិន្ទុឆែក \(Enquiry\) លើប្រព័ន្ធ CBC ផ្លូវការឡើយ។$/)
    assert.doesNotMatch(text, /&|[០-៩]|កម្មវិធី|អែប/)
  })

  it("dates in international digits", () => {
    assert.equal(statementDate("2027-01-05"), "5 មករា 2027")
  })

  it("the page: title, who and when, the three sections, the 24-month matrix and the disclaimer — and the sheet opens it", async () => {
    const React = await import("react")
    ;(globalThis as unknown as { React: typeof React }).React = React // the test runner's classic JSX
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { StatementPaper } = await import("../components/loans/statement-paper")
    const a = assessCredit([loan("0".repeat(24), 300)], 1000)
    const html = renderToStaticMarkup(React.createElement(StatementPaper, { s: buildStatement(a, who), dti: a.dti }))
    for (const t of ["របាយការណ៍វាយតម្លៃសមត្ថភាពឥណទានបឋម · អេប លុយឆ្លាត", "Pre-Loan Assessment Statement", "ស៊ូ ចិន្តា", "21 តុលា 2026", "1. ស្ថានភាពឥណទាន", "Grade A", "អត្រាសងទៀងទាត់ 24 ខែ", "កម្ចីកំពុងសង", "2. លំហូរសាច់ប្រាក់ និងបន្ទុកបំណុល", "$300.00 / ខែ", "30% · ក្រោម 40% — សុវត្ថិភាព", "3. ប្រវត្តិសងប្រាក់ 24 ខែ", SOFT_CHECK_DISCLAIMER, "មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ"])
      assert.ok(html.includes(t), t)
    assert.equal(html.match(/<li /g)?.length, 24)
    assert.match(html, /left-\[40%\]/) // the 40% safety line on the DTI bar
    assert.doesNotMatch(html, /dark:/) // white paper in dark mode too
    const { CbcAssessmentView } = await import("../components/loans/cbc-health-modal")
    const sheet = renderToStaticMarkup(React.createElement(CbcAssessmentView, { a }))
    assert.match(sheet, /href="\/debts\/statement"[^>]*>📄 ទាញយករបាយការណ៍បឋម \(PDF \/ Print\)/)
  })
})
