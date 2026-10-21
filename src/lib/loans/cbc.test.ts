import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { CBC_CODES, CBC_ESTIMATE_NOTE, cbcClosedOn, cbcCodeForDaysLate, cbcHealth, cbcMonthStrip, cbcStrip, kmMonthLabel } from "./cbc"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const monthly = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i + 1, date: `20${String(25 + Math.floor((i + 9) / 12)).padStart(2, "0")}-${String(((i + 9) % 12) + 1).padStart(2, "0")}-05`, paid: true }))

describe("CBC — the 24-month repayment codes (founder, 20/10/2026)", () => {
  it("the guide: the founder's codes and colours — 0, C, Q green; 1, 2 amber; 3–L, D, W, R, N, V, M red", () => {
    const by = (tier: string) => CBC_CODES.filter((c) => c.tier === tier).map((c) => c.code)
    assert.deepEqual(by("good"), ["0", "C", "Q"])
    assert.deepEqual(by("warn"), ["1", "2"])
    assert.deepEqual(by("bad"), ["3 – L", "D", "W", "R", "N", "V", "M"])
    assert.equal(CBC_CODES.find((c) => c.code === "1")!.km, "សងយឺត 1-29 ថ្ងៃ")
    assert.equal(CBC_CODES.find((c) => c.code === "W")!.km, "ឥណទានខូច")
  })
  it("days late → code: 0 on time, 1 for 1–29, 2 for 30–59, «3+» from 60 (the letters beyond are not guessed)", () => {
    assert.equal(cbcCodeForDaysLate(-3).code, "0")
    assert.equal(cbcCodeForDaysLate(0).code, "0")
    assert.equal(cbcCodeForDaysLate(1).code, "1")
    assert.equal(cbcCodeForDaysLate(29).code, "1")
    assert.equal(cbcCodeForDaysLate(30).code, "2")
    assert.equal(cbcCodeForDaysLate(59).code, "2")
    assert.deepEqual(cbcCodeForDaysLate(60), { code: "3+", tier: "bad" })
  })
  it("the strip: the last 24 due cycles; a recorded payment date gives its code; paid without a date «✓»; unpaid and past due → late until today", () => {
    const rows = monthly(30) // 30 monthly installments from 2025-10-05
    const today = "2027-03-20"
    const paidOn = new Map<number, string>([
      [17, "2027-02-04"], // on time (due 2027-02-05)
      [16, "2027-01-15"], // 10 days late
    ])
    rows[17].paid = false // installment 18 (due 2027-03-05) unpaid
    const cells = cbcStrip(rows, paidOn, today)
    assert.equal(cells.length, 18) // 18 cycles due by today
    assert.deepEqual(cells.at(-1), { n: 18, due: "2027-03-05", code: "1", tier: "warn" }) // 15 days late, unpaid
    assert.equal(cells.find((c) => c.n === 17)!.code, "0")
    assert.equal(cells.find((c) => c.n === 16)!.code, "1")
    assert.equal(cells.find((c) => c.n === 1)!.code, "✓") // imported history: paid, no date
    assert.equal(cbcStrip(monthly(40), new Map(), "2029-01-01").length, 24) // never more than 24
  })
  it("the health line: excellent with a run of 0, careful with a 1 or 2, at risk from 60 days; unknown without dates", () => {
    const zeros = [1, 2, 3].map((n) => ({ n, due: "x", code: "0", tier: "good" as const }))
    assert.equal(cbcHealth(zeros).km, "🟢 សុខភាពក្រេឌីត៖ ល្អឥតខ្ចោះ (កូដ 0 ជាប់គ្នា 3 ខែ)")
    assert.equal(cbcHealth([...zeros, { n: 4, due: "x", code: "1", tier: "warn" }]).tier, "warn")
    assert.equal(cbcHealth([{ n: 1, due: "x", code: "3+", tier: "bad" }, ...zeros]).tier, "bad")
    assert.equal(cbcHealth([{ n: 1, due: "x", code: "✓", tier: "unknown" }]).tier, "unknown")
    assert.match(CBC_ESTIMATE_NOTE, /មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ/) // never presented as the official report
  })
  it("wired: the guide on the loans tab, the strip on a loan, the reminder's tip in the database", () => {
    assert.match(read("src/app/(app)/debts/page.tsx"), /\{tab === "PAYABLE" && <CbcHealthModal/) // «🛡️ សុខភាពឥណទាន CBC» (21/10/2026)
    assert.match(read("src/app/(app)/debts/[id]/page.tsx"), /\{debt\.type === "PAYABLE" && <CbcStrip debt=\{debt\} \/>\}/)
    const sql = read("supabase/migrations/20270209000000_loan_reminder_cbc_tip.sql")
    assert.match(sql, /💡 បង់ទាន់ពេលដើម្បីរក្សាកូដ \[0\] ក្នុងប្រព័ន្ធ CBC!/)
    assert.match(sql, /raise exception 'loan reminder CBC tip/) // each replacement exactly once
  })
})

describe("The 24-month calendar strip and «🛡️ សុខភាពឥណទាន CBC» (founder, 21/10/2026)", () => {
  const today = "2026-10-21"
  it("24 calendar months up to this one, each named «តុលា 26»; X before the loan; each month's code from its installment", () => {
    const rows = monthly(30) // 2025-10-05 onwards, imported as paid
    rows[12].paid = false // installment 13, due 2026-10-05: unpaid
    const paidOn = new Map([
      [12, "2026-09-05"], // due 2026-09-05: on time
      [11, "2026-09-20"], // due 2026-08-05: 46 days late
    ])
    const cells = cbcMonthStrip(rows, paidOn, today, "2025-10-01", null)
    assert.equal(cells.length, 24)
    assert.equal(cells[0].month, "2024-11")
    assert.equal(cells[0].label, "វិច្ឆិកា 24")
    assert.equal(cells[23].label, "តុលា 26")
    assert.deepEqual(cells.slice(0, 11).map((c) => c.code), Array(11).fill("X")) // Nov 2024 – Sep 2025: before the loan
    assert.equal(cells.find((c) => c.month === "2025-10")!.code, "✓") // imported history: paid, no date
    assert.equal(cells.find((c) => c.month === "2026-08")!.code, "2") // paid 46 days late
    assert.equal(cells.find((c) => c.month === "2026-09")!.code, "0")
    assert.deepEqual(cells.at(-1), { month: "2026-10", label: "តុលា 26", code: "1", tier: "warn", due: "2026-10-05" }) // 16 days late, unpaid
  })
  it("an installment due later this month waits («…»), never counted late; a month with nothing due is Q (CBC's own code)", () => {
    const rows = monthly(30)
    rows[12].paid = false
    assert.equal(cbcMonthStrip(rows, new Map(), "2026-10-03", "2025-10-01", null).at(-1)!.code, "…")
    // Borrowed in August, first installment in October: August and September had nothing due.
    const cells = cbcMonthStrip(monthly(30), new Map(), today, "2025-08-10", null)
    assert.equal(cells.find((c) => c.month === "2025-08")!.code, "Q")
    assert.equal(cells.find((c) => c.month === "2025-09")!.code, "Q")
  })
  it("paid off: C from the month of the last payment; a month with two installments shows the worse one", () => {
    const six = monthly(6) // 2025-10-05 … 2026-03-05, all paid
    const paidOn = new Map([[6, "2026-03-04"]])
    const closed = cbcClosedOn(six, paidOn)
    assert.equal(closed, "2026-03-04")
    const cells = cbcMonthStrip(six, paidOn, today, "2025-10-01", closed)
    assert.equal(cells.find((c) => c.month === "2026-03")!.code, "0")
    assert.deepEqual(cells.filter((c) => c.month > "2026-03").map((c) => c.code), Array(7).fill("C"))
    assert.equal(cbcClosedOn([...six, { n: 7, date: "2026-04-05", paid: false }], paidOn), null) // not all paid: open
    const twice = [{ n: 1, date: "2026-09-05", paid: true }, { n: 2, date: "2026-09-19", paid: true }]
    assert.equal(cbcMonthStrip(twice, new Map([[1, "2026-09-05"], [2, "2026-10-25"]]), today, "2026-09-01", null).find((c) => c.month === "2026-09")!.code, "2")
    assert.equal(kmMonthLabel("2026-01"), "មករា 26")
  })
  it("the code meanings stay the live CBC table (founder, 20/10/2026): 1 = 1–29 days, 2 = 30–59, «3+» from 60, W a write-off", () => {
    assert.equal(cbcCodeForDaysLate(29).code, "1")
    assert.equal(cbcCodeForDaysLate(45).code, "2")
    assert.equal(cbcCodeForDaysLate(75).code, "3+")
    assert.equal(CBC_CODES.find((c) => c.code === "W")!.km, "ឥណទានខូច")
    assert.equal(CBC_CODES.find((c) => c.code === "D")!.km, "ពន្យារពេលនៃការសង")
  })
  it("the modal renders: what CBC is, why banks read it, the colours, every code, the 24-month way back to green, the estimate note", async () => {
    const React = await import("react")
    ;(globalThis as unknown as { React: typeof React }).React = React // the test runner's classic JSX
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { CbcHealthContent, STRIP_LEGEND, CODE_TONE } = await import("../../components/loans/cbc-health-modal")
    const html = renderToStaticMarkup(React.createElement(CbcHealthContent))
    for (const s of ["CBC ជាអ្វី?", "មុននឹងអនុម័តកម្ចីថ្មី ធនាគារពិនិត្យប្រវត្តិនេះជានិច្ច", "វចនានុក្រមកូដ CBC", "24 វដ្តចុងក្រោយ", "បង់ទាន់ពេលជាប់គ្នា 24 ខែ", "មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ"])
      assert.ok(html.includes(s), s)
    for (const c of CBC_CODES) assert.ok(html.includes(`>${c.code}<`), c.code)
    for (const l of STRIP_LEGEND) assert.ok(CODE_TONE[l.code] && html.includes(l.km), l.code)
    for (const code of ["0", "1", "2", "3+", "C", "Q", "X", "✓", "…"]) assert.ok(CODE_TONE[code], code) // every strip code has its colour
    assert.doesNotMatch(html, / & |កម្មវិធី|អែប/)
    assert.match(read("src/components/loans/cbc-strip.tsx"), /<CbcHealthModal \/>/)
    assert.match(read("src/components/loans/cbc-strip.tsx"), /cbcMonthStrip\(rows, paidOn, today, debt\.start_date, cbcClosedOn\(rows, paidOn\)\)/)
  })
})
