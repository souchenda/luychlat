// Islamic Mode replaces the Buddhist lunar day and «ថ្ងៃសីល» in the home header with the Hijri date
// (founder, 18/10/2026).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { headerBadge, toHijri } from "../src/lib/islamic"

const today = new Date(2026, 9, 18) // 18 October 2026 = 7 Jumada al-Ula 1448

describe("home header — Islamic Mode shows the Hijri date, never «ថ្ងៃសីល»", () => {
  it("Islamic Mode on: «🌙 ៧ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ម.ស.» (English «7 Jumada al-Ula 1448 AH»), no lunar badge", () => {
    const h = toHijri(today)
    assert.deepEqual(h, { day: 7, month: 5, year: 1448 })
    assert.deepEqual(headerBadge({ islamic: true, hijri: h, locale: "km" }), { kind: "hijri", text: "🌙 ៧ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨" })
    assert.deepEqual(headerBadge({ islamic: true, hijri: h, locale: "en" }), { kind: "hijri", text: "🌙 7 Jumada al-Ula 1448" })
  })
  it("Islamic Mode on, any day of the year: never the lunar badge, never «ថ្ងៃសីល» / «សីល»", () => {
    for (let d = 0; d < 366; d++) {
      const date = new Date(2026, 0, 1 + d)
      const b = headerBadge({ islamic: true, hijri: toHijri(date), locale: "km" })
      assert.notEqual(b.kind, "lunar")
      assert.ok(!JSON.stringify(b).includes("សីល"), `${date.toDateString()}: ${JSON.stringify(b)}`)
    }
  })
  it("in season the greeting (Ramadan / the Eids); a browser without the Islamic calendar shows no badge — never the lunar one", () => {
    assert.deepEqual(headerBadge({ islamic: true, hijri: { day: 10, month: 9, year: 1448 }, locale: "km" }), { kind: "greeting", key: "islamic.ramadan" })
    assert.deepEqual(headerBadge({ islamic: true, hijri: null, locale: "km" }), { kind: "none" })
  })
  it("Islamic Mode off: the traditional lunar day and «ថ្ងៃសីល» pill", () => {
    assert.deepEqual(headerBadge({ islamic: false, hijri: null, locale: "km" }), { kind: "lunar" })
  })
  it("the home page renders the lunar pill only for the «lunar» badge", () => {
    const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
    assert.match(home, /const badge = headerBadge\(\{ islamic, hijri, locale \}\)/)
    assert.match(home, /badge\.kind === "lunar" \? \(\s*<LunarPill onOpen=\{\(\) => setCalendarOpen\(true\)\} \/>/)
    assert.equal([...home.matchAll(/<LunarPill\b/g)].length, 1)
  })
  it("a tap on either badge opens the calendar switch (Khmer lunar ↔ Hijri = Islamic Mode off / on)", () => {
    const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
    assert.match(home, /<CalendarSwitchSheet open=\{calendarOpen\} onOpenChange=\{setCalendarOpen\} \/>/)
    assert.equal([...home.matchAll(/setCalendarOpen\(true\)/g)].length, 2)
    const sheet = readFileSync(join(process.cwd(), "src", "components", "dashboard", "calendar-switch-sheet.tsx"), "utf8")
    assert.match(sheet, /setEnabled\.mutate\(on/)
  })
})
