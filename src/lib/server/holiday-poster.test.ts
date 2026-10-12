import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holidayMoment } from "../holiday-lifecycle"

import { holidayPosterText, noEmoji } from "./holiday-poster"

describe("holiday poster — the words on the artwork", () => {
  it("the day back after Pchum Ben: the title, the dates as a chip, the blessing and the tip — no emoji (the fonts have none)", () => {
    const t = holidayPosterText(holidayMoment("2026-10-13")!)
    assert.equal(t.title, "សូមស្វាគមន៍ការត្រឡប់មកវិញ")
    assert.equal(t.date, "១០–១២ តុលា · ឈប់សម្រាក ៣ ថ្ងៃ")
    assert.match(t.lead, /^សូមអនុមោទនាកុសលបុណ្យ។/)
    assert.match(t.tip ?? "", /^ថ្ងៃនេះ ពិនិត្យសមតុល្យគណនី/)
    for (const s of [t.title, t.date, t.lead, t.tip ?? ""]) assert.doesNotMatch(s, /\p{Extended_Pictographic}/u)
  })
  it("the eve of the Water Festival: the date line is not repeated in the message", () => {
    const t = holidayPosterText(holidayMoment("2026-11-20")!)
    assert.equal(t.title, "ស្អែកចាប់ផ្តើមបុណ្យអុំទូក")
    assert.equal(t.date, "២១–២៥ វិច្ឆិកា · ឈប់សម្រាក ៥ ថ្ងៃ")
    assert.doesNotMatch(t.lead, /វិច្ឆិកា/)
    assert.equal(t.tip, null)
  })
  it("noEmoji keeps Khmer and Latin, drops pictographs and their joiners", () => {
    assert.equal(noEmoji("🪷 សូមអនុមោទនា 🙏"), "សូមអនុមោទនា")
    assert.equal(noEmoji("☀️ Welcome back"), "Welcome back")
  })
})
