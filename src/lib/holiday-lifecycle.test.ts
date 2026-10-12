import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holidayBlockAt, holidayCard, holidayDue, holidayMessage, holidayMoment, holidayPostHtml, kmRange } from "./holiday-lifecycle"

const at = (iso: string) => Date.parse(iso)

describe("holiday lifecycle — when the notes go out", () => {
  it("Pchum Ben 2026 (Sat 10 – Mon 12 Oct): the eve is Friday 9, back to work Tuesday 13", () => {
    assert.deepEqual(holidayBlockAt("2026-10-11"), { start: "2026-10-10", end: "2026-10-12", days: 3, kind: "PCHUM_BEN" })
    assert.equal(holidayMoment("2026-10-09")?.stage, "pre")
    assert.equal(holidayMoment("2026-10-13")?.stage, "post")
    assert.equal(holidayMoment("2026-10-13")?.block.kind, "PCHUM_BEN")
  })
  it("Water Festival 2026 (Mon 23 – Wed 25 Nov) joins the weekend before: 21–25 Nov, eve Friday 20, back Thursday 26", () => {
    assert.deepEqual(holidayMoment("2026-11-20"), { stage: "pre", block: { start: "2026-11-21", end: "2026-11-25", days: 5, kind: "WATER_FESTIVAL" } })
    assert.equal(holidayMoment("2026-11-26")?.stage, "post")
  })
  it("Khmer New Year 2027 (Wed 14 – Fri 16 Apr) runs into the weekend: back Monday 19", () => {
    assert.deepEqual(holidayBlockAt("2027-04-15"), { start: "2027-04-14", end: "2027-04-18", days: 5, kind: "KHMER_NEW_YEAR" })
    assert.equal(holidayMoment("2027-04-13")?.stage, "pre")
    assert.equal(holidayMoment("2027-04-19")?.stage, "post")
  })
  it("a single weekday holiday and a Monday long weekend are general holidays", () => {
    assert.deepEqual(holidayBlockAt("2026-10-29"), { start: "2026-10-29", end: "2026-10-29", days: 1, kind: "GENERAL" })
    assert.equal(holidayMoment("2026-10-28")?.stage, "pre")
    assert.equal(holidayMoment("2026-10-30")?.stage, "post")
    // Independence Day, Monday 9 Nov 2026: Sat 7 – Mon 9.
    assert.deepEqual(holidayMoment("2026-11-06")?.block, { start: "2026-11-07", end: "2026-11-09", days: 3, kind: "GENERAL" })
  })
  it("nothing on an ordinary weekday, a plain weekend or during the holiday; Christmas is not a day off", () => {
    assert.equal(holidayMoment("2026-10-16"), null)
    assert.equal(holidayBlockAt("2026-10-17"), null)
    assert.equal(holidayMoment("2026-10-11"), null)
    assert.equal(holidayMoment("2026-12-24"), null)
  })
})

describe("holiday lifecycle — the channel's windows", () => {
  it("the eve: 18:00–19:29; the day back: 07:30–08:59; nothing on other days", () => {
    assert.equal(holidayDue("2026-11-20", 17 * 60 + 59), null)
    assert.equal(holidayDue("2026-11-20", 18 * 60), "holiday-pre")
    assert.equal(holidayDue("2026-11-20", 19 * 60 + 30), null)
    assert.equal(holidayDue("2026-11-26", 7 * 60 + 29), null)
    assert.equal(holidayDue("2026-11-26", 7 * 60 + 30), "holiday-post")
    assert.equal(holidayDue("2026-11-26", 9 * 60), null)
    assert.equal(holidayDue("2026-10-16", 18 * 60), null)
  })
})

describe("holiday lifecycle — the bell card and the words", () => {
  it("the eve's card from 18:00, the day back's from 07:30 (Cambodia time)", () => {
    assert.equal(holidayCard(at("2026-11-20T10:59:00Z")), null) // 17:59
    assert.equal(holidayCard(at("2026-11-20T11:00:00Z"))?.stage, "pre") // 18:00
    assert.equal(holidayCard(at("2026-11-26T00:29:00Z")), null) // 07:29
    const back = holidayCard(at("2026-11-26T00:30:00Z"))! // 07:30
    assert.equal(back.stage, "post")
    assert.equal(back.at, "2026-11-26T00:30:00.000Z")
  })
  it("Khmer dates; Pchum Ben stays reverent (អនុមោទនា, never រីករាយ); no brand-standard slips", () => {
    assert.equal(kmRange({ start: "2026-11-21", end: "2026-11-25" }), "២១–២៥ វិច្ឆិកា")
    assert.equal(kmRange({ start: "2027-04-30", end: "2027-05-02" }), "៣០ មេសា–២ ឧសភា")
    const pchum = holidayMessage(holidayMoment("2026-10-13")!)
    assert.match(pchum.body, /អនុមោទនា/)
    for (const day of ["2026-10-09", "2026-10-13", "2026-11-20", "2026-11-26", "2027-04-13", "2027-04-19", "2026-10-28", "2026-10-30"]) {
      const m = holidayMoment(day)!
      const { title, body } = holidayMessage(m)
      assert.doesNotMatch(title + body, /រីករាយ|អែប|កម្មវិធី|&/)
      assert.match(holidayPostHtml(m), /^<b>.+<\/b>\n\n/)
    }
    assert.match(holidayMessage(holidayMoment("2026-11-20")!).body, /^📅 ២១–២៥ វិច្ឆិកា · ឈប់សម្រាក ៥ ថ្ងៃ/)
  })
})
