import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildCfoBrief, cfoBriefDue, cfoFigures, cfoTip, change, inWs, type CfoData } from "./cfo-brief"

// DL MEAT SUPPLY's week of 05–11/10/2026 as cfo_brief_data returned it (rounded).
const DL: CfoData = {
  workspace: "DL MEAT SUPPLY",
  currency: "USD",
  rate: 4000,
  week_start: "2026-10-05",
  sales: 39424.39,
  sales_prev: 13665.93,
  income: 39424.39,
  income_prev: 13665.93,
  expense: 2825.74,
  expense_prev: 3115.82,
  cash: 24079.82,
  bills: [{ title: "អគ្គិសនី · ហាង", amount: 886900, currency: "KHR", due: "2026-10-15" }],
  receivables: [],
}

describe("CFO brief — figures", () => {
  it("net profit, bills in the next 7 days (riel converted), cash cover", () => {
    const f = cfoFigures(DL)
    assert.equal(Math.round(f.net * 100) / 100, 36598.65)
    assert.equal(Math.round(f.billsUsd * 100) / 100, 221.73)
    assert.ok(f.cover! > 100)
  })
  it("week-on-week change; nothing to compare with an empty previous week", () => {
    assert.equal(change(39424.39, 13665.93)?.text, "▲ 188%")
    assert.equal(change(80, 100)?.text, "▼ 20%")
    assert.equal(change(50, 0), null)
  })
  it("a riel workspace: amounts to the nearest 100 ៛", () => {
    assert.equal(inWs(12.3456, { currency: "KHR", rate: 4100 }), 50_600)
  })
})

describe("CFO brief — the tip, by priority", () => {
  it("cash short of the week's bills comes first", () => {
    assert.match(cfoTip({ ...DL, cash: 100 }), /មិនគ្រប់សម្រាប់វិក្កយបត្រ ៧ ថ្ងៃខាងមុខ/)
  })
  it("then the most overdue customer", () => {
    const d = { ...DL, receivables: [{ party: "ហាង សុខា", amount: 450, currency: "USD" as const, days: 21 }] }
    assert.match(cfoTip(d), /ទាក់ទង ហាង សុខា ដើម្បីប្រមូល \$450\.00 \(ហួស 21 ថ្ងៃ\)/)
  })
  it("then sales falling 15% or more, then heavy spending, else the 1% tax reserve", () => {
    assert.match(cfoTip({ ...DL, sales: 8000, sales_prev: 10000 }), /ការលក់ធ្លាក់ 20%/)
    assert.match(cfoTip({ ...DL, income: 1000, expense: 900, sales: 1000, sales_prev: 1000 }), /ចំណាយស្មើ 90%/)
    assert.match(cfoTip(DL), /ទុក \$394\.24 \(១% នៃការលក់សប្ដាហ៍នេះ\)/)
  })
})

describe("CFO brief — the message", () => {
  const text = buildCfoBrief(DL)
  it("all four parts, Telegram-safe", () => {
    assert.match(text, /^🩺 <b>សុខភាពហិរញ្ញវត្ថុប្រចាំសប្ដាហ៍ · DL MEAT SUPPLY<\/b>\nសប្ដាហ៍ 05\/10 – 11\/10/)
    assert.match(text, /📈 លក់បាន៖ <b>\$39,424\.39<\/b> \(▲ 188% · សប្ដាហ៍មុន \$13,665\.93\)/)
    assert.match(text, /🧾 ត្រូវបង់ ៧ ថ្ងៃខាងមុខ៖ <b>\$221\.73<\/b> \(1 វិក្កយបត្រ\)\n• អគ្គិសនី · ហាង — 886,900៛ · 15\/10\n✅/)
    assert.match(text, /⏳ អតិថិជនជំពាក់ហួស ៧ ថ្ងៃ៖ ✅ គ្មាន/)
    assert.match(text, /💡 <b>យុទ្ធសាស្ត្រសប្ដាហ៍ក្រោយ៖<\/b>/)
  })
  it("names are HTML-escaped", () => {
    assert.match(buildCfoBrief({ ...DL, workspace: "A&B <Shop>" }), /A&amp;B &lt;Shop&gt;/)
  })
})

describe("CFO brief — when", () => {
  it("Sunday from 18:00 (until 21:00), never another day", () => {
    assert.ok(cfoBriefDue("2026-10-11", 18))
    assert.ok(cfoBriefDue("2026-10-11", 20))
    assert.ok(!cfoBriefDue("2026-10-11", 17))
    assert.ok(!cfoBriefDue("2026-10-11", 21))
    assert.ok(!cfoBriefDue("2026-10-12", 18))
  })
})
