import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MORNING_QUOTES, morningCard, morningPush, morningQuote } from "./morning"

const at = (iso: string) => Date.parse(iso)

describe("07:00 morning message (Cambodia time, UTC+7)", () => {
  it("the push: title, the quote with the call to record, opens the app", () => {
    const p = morningPush("2026-10-12")
    assert.equal(p.title, "☀️ អរុណសួស្តីពី អេប លុយឆ្លាត")
    assert.equal(p.body, `${morningQuote("2026-10-12")} — ចុចដើម្បីកត់ត្រាចំណូល-ចំណាយថ្ងៃថ្មី!`)
    assert.equal(p.url, "https://app.luychlat.com")
  })
  it("the bell card appears from 07:00 Phnom Penh time, dated today's 07:00", () => {
    assert.equal(morningCard(at("2026-10-09T06:59:00+07:00")), null)
    assert.deepEqual(morningCard(at("2026-10-09T07:00:00+07:00")), { day: "2026-10-09", at: "2026-10-09T00:00:00.000Z" })
    assert.equal(morningCard(at("2026-10-09T23:30:00+07:00"))?.day, "2026-10-09")
    // Just after midnight in Cambodia (still the 9th in UTC): no card until 07:00 of the 10th.
    assert.equal(morningCard(at("2026-10-09T17:30:00Z")), null)
  })
})

describe("the morning quote rotates with the day of the month", () => {
  it("31 different quotes; 11 and 12 October differ; the 1st and the 31st are the first and last", () => {
    assert.equal(MORNING_QUOTES.length, 31)
    assert.equal(new Set(MORNING_QUOTES).size, 31)
    assert.notEqual(morningQuote("2026-10-11"), morningQuote("2026-10-12"))
    assert.equal(morningQuote("2026-10-01"), MORNING_QUOTES[0])
    assert.equal(morningQuote("2026-10-31"), MORNING_QUOTES[30])
    for (let d = 1; d < 31; d++) assert.notEqual(morningQuote(`2026-10-${String(d).padStart(2, "0")}`), morningQuote(`2026-10-${String(d + 1).padStart(2, "0")}`))
  })
  it("never «អែប», «កម្មវិធី» or «&» (the Khmer copy standard)", () => {
    for (const q of MORNING_QUOTES) assert.doesNotMatch(q, /អែប|កម្មវិធី|&/)
  })
  it("Gen Z deadpan: a hook, then one thing to do after 💡; no «» inside (the caption wraps each quote in «»)", () => {
    for (const q of MORNING_QUOTES) {
      assert.match(q, /^.+ 💡 .+$/)
      assert.doesNotMatch(q, /[«»]/)
      assert.ok(q.length <= 140, q)
    }
  })
})
