import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MORNING_QUOTE, morningCard, morningPush } from "./morning"

const at = (iso: string) => Date.parse(iso)

describe("07:00 morning message (Cambodia time, UTC+7)", () => {
  it("the push: title, the quote with the call to record, opens the app", () => {
    const p = morningPush()
    assert.equal(p.title, "☀️ អរុណសួស្តីពី លុយឆ្លាត")
    assert.equal(p.body, `${MORNING_QUOTE} — ចុចដើម្បីកត់ត្រាចំណូល-ចំណាយថ្ងៃថ្មី!`)
    assert.equal(p.url, "https://luy.ibmserp.com")
  })
  it("the bell card appears from 07:00 Phnom Penh time, dated today's 07:00", () => {
    assert.equal(morningCard(at("2026-10-09T06:59:00+07:00")), null)
    assert.deepEqual(morningCard(at("2026-10-09T07:00:00+07:00")), { day: "2026-10-09", at: "2026-10-09T00:00:00.000Z" })
    assert.equal(morningCard(at("2026-10-09T23:30:00+07:00"))?.day, "2026-10-09")
    // Just after midnight in Cambodia (still the 9th in UTC): no card until 07:00 of the 10th.
    assert.equal(morningCard(at("2026-10-09T17:30:00Z")), null)
  })
})
