import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { CBC_CODES, CBC_ESTIMATE_NOTE, cbcCodeForDaysLate, cbcHealth, cbcStrip } from "./cbc"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const monthly = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i + 1, date: `20${String(25 + Math.floor((i + 9) / 12)).padStart(2, "0")}-${String(((i + 9) % 12) + 1).padStart(2, "0")}-05`, paid: true }))

describe("CBC — the 24-month repayment codes (founder, 20/10/2026)", () => {
  it("the guide: the founder's codes and colours — 0, C, Q green; 1, 2 amber; 3–L, D, W, R, N, V, M red", () => {
    const by = (tier: string) => CBC_CODES.filter((c) => c.tier === tier).map((c) => c.code)
    assert.deepEqual(by("good"), ["0", "C", "Q"])
    assert.deepEqual(by("warn"), ["1", "2"])
    assert.deepEqual(by("bad"), ["3 – L", "D", "W", "R", "N", "V", "M"])
    assert.equal(CBC_CODES.find((c) => c.code === "1")!.km, "សងយឺត ១-២៩ ថ្ងៃ")
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
    assert.equal(cbcHealth(zeros).km, "🟢 សុខភាពក្រេឌីត៖ ល្អឥតខ្ចោះ (កូដ ០ ជាប់គ្នា ៣ ខែ)")
    assert.equal(cbcHealth([...zeros, { n: 4, due: "x", code: "1", tier: "warn" }]).tier, "warn")
    assert.equal(cbcHealth([{ n: 1, due: "x", code: "3+", tier: "bad" }, ...zeros]).tier, "bad")
    assert.equal(cbcHealth([{ n: 1, due: "x", code: "✓", tier: "unknown" }]).tier, "unknown")
    assert.match(CBC_ESTIMATE_NOTE, /មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ/) // never presented as the official report
  })
  it("wired: the guide on the loans tab, the strip on a loan, the reminder's tip in the database", () => {
    assert.match(read("src/app/(app)/debts/page.tsx"), /\{tab === "PAYABLE" && <CbcCodeGuide/)
    assert.match(read("src/app/(app)/debts/[id]/page.tsx"), /\{debt\.type === "PAYABLE" && <CbcStrip debt=\{debt\} \/>\}/)
    const sql = read("supabase/migrations/20270209000000_loan_reminder_cbc_tip.sql")
    assert.match(sql, /💡 បង់ទាន់ពេលដើម្បីរក្សាកូដ \[0\] ក្នុងប្រព័ន្ធ CBC!/)
    assert.match(sql, /raise exception 'loan reminder CBC tip/) // each replacement exactly once
  })
})
