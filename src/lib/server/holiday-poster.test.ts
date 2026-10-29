import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { holidayMoment } from "../holiday-lifecycle"

import { holidayPosterText, noEmoji } from "./holiday-poster"

describe("holiday poster — the words on the artwork", () => {
  it("the day back after Pchum Ben: the title, the dates as a chip, the blessing and the tip — no emoji (the fonts have none)", () => {
    const t = holidayPosterText(holidayMoment("2026-10-13")!)
    assert.equal(t.title, "សូមស្វាគមន៍ការត្រឡប់មកវិញ")
    assert.equal(t.date, "ចូលធ្វើការវិញ · ថ្ងៃអង្គារ ១៣ តុលា")
    assert.match(t.lead, /^សូមអនុមោទនាកុសលបុណ្យ។/)
    assert.match(t.tip ?? "", /^ថ្ងៃនេះ ពិនិត្យសមតុល្យគណនី/)
    for (const s of [t.title, t.date, t.lead, t.tip ?? ""]) assert.doesNotMatch(s, /\p{Extended_Pictographic}/u)
  })
  it("the day back names its own day, never the holiday's date with «ឈប់សម្រាក» (founder, 29/10/2026 — the 30 October poster)", () => {
    const t = holidayPosterText(holidayMoment("2026-10-30")!)
    assert.equal(t.date, "ចូលធ្វើការវិញ · ថ្ងៃសុក្រ ៣០ តុលា")
    assert.doesNotMatch(t.date, /ឈប់សម្រាក/)
    const src = readFileSync(join(process.cwd(), "src/lib/server/holiday-poster.ts"), "utf8")
    assert.match(src, /m\.stage === "post" && m\.block\.kind === "GENERAL" \? "ចូលធ្វើការវិញ"/)
    // The card already waiting for 30 October is sent again with this poster.
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270279000000_repreview_holiday_back_day.sql"), "utf8"), /'holiday-back-day'[\s\S]*post_key = '2026-10-30-post' and status = 'PENDING'/)
    assert.match(readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8"), /const REPREVIEW_READY = \[[^\]]*"holiday-back-day"/)
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
