import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { activeGreeting, shouldShowSplash, shownDateKey } from "./festive-greeting"

describe("festive greeting — which festival, when", () => {
  it("Pchum Ben 2026: 10–12 October (the official holiday), not the 13th", () => {
    for (const day of ["2026-10-10", "2026-10-11", "2026-10-12"]) assert.equal(activeGreeting(day, { islamic: false })?.key, "pchum_ben", day)
    assert.equal(activeGreeting("2026-10-13", { islamic: false }), null)
    assert.equal(activeGreeting("2026-10-09", { islamic: false }), null)
  })
  it("Khmer New Year 14–16 April and the Water Festival in November", () => {
    assert.equal(activeGreeting("2026-04-14", { islamic: false })?.key, "khmer_new_year")
    assert.equal(activeGreeting("2026-11-24", { islamic: false })?.key, "water_festival")
  })
  it("Pchum Ben (a Buddhist merit festival) is not shown in Islamic Mode; the national festivals are", () => {
    assert.equal(activeGreeting("2026-10-11", { islamic: true }), null)
    assert.equal(activeGreeting("2026-04-14", { islamic: true })?.key, "khmer_new_year")
  })
  it("other cultural days (e.g. Chinese New Year) have no splash; a preview shows one on any day", () => {
    assert.equal(activeGreeting("2027-02-06", { islamic: false }), null)
    assert.equal(activeGreeting("2026-06-01", { islamic: true, preview: "pchum_ben" })?.key, "pchum_ben")
    assert.equal(activeGreeting("2026-06-01", { islamic: false, preview: "dongzhi" }), null)
  })
})

describe("festive greeting — on opening the app, once a day (never on refresh)", () => {
  it("shown when not yet shown today; not again the same day; again the next day", () => {
    assert.equal(shownDateKey("pchum_ben"), "pchum_ben_greeting_shown_date")
    assert.ok(shouldShowSplash(null, "2026-10-11"))
    assert.ok(!shouldShowSplash("2026-10-11", "2026-10-11"))
    assert.ok(shouldShowSplash("2026-10-11", "2026-10-12"))
  })
})

describe("Home festival banner — decided on the first render", () => {
  it("shown on Pchum Ben until closed for this festival; closed last year doesn't count", async () => {
    const { festivalBannerDay } = await import("./cultural-calendar")
    assert.equal(festivalBannerDay("2026-10-11", () => null)?.key, "pchum_ben")
    assert.equal(festivalBannerDay("2026-10-11", () => "2026-10-10"), null)
    assert.equal(festivalBannerDay("2026-10-11", () => "2025-09-20")?.key, "pchum_ben")
    assert.equal(festivalBannerDay("2026-10-13", () => null), null)
  })
})
