import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ISLAMIC_TIPS, islamicTipOfTheDay } from "./islamic-tips"
import { tipOfTheDay } from "./tips"

describe("Islamic tips — Islamic Mode's daily wisdom (founder, 18/10/2026)", () => {
  it("every tip names an exact source: Surah:Ayah, Sahih al-Bukhari n or Sahih Muslim n, with its link", () => {
    for (const t of ISLAMIC_TIPS) {
      assert.match(t.ref.label, /^(Al-[A-Za-z']+ \d+:\d+|Sahih al-Bukhari \d+|Sahih Muslim \d+)$/, t.id)
      assert.match(t.ref.url, /^https:\/\/(quran\.com\/\d+\/\d+|sunnah\.com\/(bukhari|muslim):\d+)$/, t.id)
      const verse = /(\d+):(\d+)$/.exec(t.ref.label)
      if (verse) assert.equal(t.ref.url, `https://quran.com/${verse[1]}/${verse[2]}`, t.id)
    }
  })
  it("covers the founder's themes: debt recording, fair trade, no interest, charity, no waste", () => {
    const refs = ISLAMIC_TIPS.map((t) => t.ref.label)
    for (const r of ["Al-Baqarah 2:282", "Al-Baqarah 2:275", "Sahih al-Bukhari 2079", "Al-Baqarah 2:261", "Al-A'raf 7:31"]) assert.ok(refs.includes(r), r)
  })
  it("Khmer and English for every tip; Khmer uses «និង», never «&»", () => {
    for (const t of ISLAMIC_TIPS) {
      for (const s of [t.title.km, t.body.km, t.title.en, t.body.en]) assert.ok(s && s.trim().length > 3, t.id)
      assert.ok(!t.body.km.includes("&") && !t.title.km.includes("&"), t.id)
    }
    assert.equal(new Set(ISLAMIC_TIPS.map((t) => t.id)).size, ISLAMIC_TIPS.length)
  })
  it("Islamic Mode on: the daily tip is always one of these; off: never", () => {
    for (let d = 0; d < 40; d++) {
      const date = new Date(2026, 9, 1 + d)
      assert.ok("ref" in tipOfTheDay(date, { islamic: true, hasDebts: true, highCardUse: true }))
      assert.ok(!("ref" in tipOfTheDay(date, { islamic: false })))
    }
    assert.equal(islamicTipOfTheDay(0, ISLAMIC_TIPS.length).id, islamicTipOfTheDay(0).id)
  })
})
