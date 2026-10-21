import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { nextTip } from "@/lib/daily-tip"
import { pickTip } from "@/lib/bot/digest"
import { postFooter, SERIES_HASHTAGS } from "@/lib/post-footer"
import { tipTextIssues } from "@/lib/tip-quality"
import { BULLET, TIPS } from "@/lib/tips"

import { tipCaption, tipSeriesTags } from "./tip-bot"
import { splitTakeaway } from "./tip-poster"

const SERIES = TIPS.filter((t) => t.series === "smart-spending")
const points = (body: string) => body.split("\n").filter((l) => l.startsWith(BULLET))

describe("«Smart Spending» tip series — the 12:00 daily tip (founder, 21/10/2026)", () => {
  it("the seven rules, in the founder's order", () => {
    assert.deepEqual(
      SERIES.map((t) => t.title.km),
      [
        "ក្បួនសន្សំមុនចាយ",
        "ក្បួនទប់ចិត្ត ៤៨ ម៉ោង",
        "ក្បួនកាហ្វេ និងចំណាយតូចតាច",
        "ក្បួនស្រោមសំបុត្រ ៣ ថង់",
        "កុំខ្ចីលុយទិញរបស់ដែលមិនបង្កើតចំណូល",
        "ក្បួនដើរផ្សារកុំឱ្យធ្លាយហោប៉ៅ",
        "ក្បួនកត់ត្រាវិក្កយបត្រ ៥ វិនាទី",
      ],
    )
    assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length, "tip ids are unique")
  })

  it("each is a hook, then exactly three short points — in Khmer and in English — and passes the tip quality rule", () => {
    for (const t of SERIES) {
      for (const body of [t.body.km, t.body.en]) {
        const [hook] = body.split("\n")
        assert.ok(!hook.startsWith(BULLET), `${t.id}: the hook comes first`)
        assert.equal(points(body).length, 3, `${t.id}: three points`)
        assert.equal(body.split("\n").length, 4, `${t.id}: nothing else`)
      }
      assert.deepEqual(tipTextIssues(t.title.km, t.body.km), [], t.id)
    }
  })

  it("Khmer copy standard: «និង» never «&», the brand «អេប លុយឆ្លាត», never «កម្មវិធី» or «អែប»", () => {
    for (const t of SERIES) {
      const km = `${t.title.km}\n${t.body.km}`
      assert.ok(!km.includes("&"), t.id)
      assert.ok(!/កម្មវិធី|អែប/.test(km), t.id)
    }
    assert.match(SERIES.find((t) => t.id === "slip-5-seconds")!.body.km, /អេប លុយឆ្លាត/)
  })

  it("no silent guessing: the latte arithmetic is right and its riel says the rate it assumes", () => {
    const cup = 2.5
    assert.equal(cup * 30, 75)
    assert.equal(cup * 30 * 12, 900)
    assert.equal(900 * 4000, 3_600_000)
    const latte = SERIES.find((t) => t.id === "track-small-spending")!.body
    assert.match(latte.km, /\$២,៥០[\s\S]*\$៧៥[\s\S]*\$៩០០[\s\S]*៣,៦ លានរៀល បើគិត ៤ ០០០ ៛ ក្នុងមួយដុល្លារ/)
    assert.match(latte.en, /\$2\.50[\s\S]*\$75[\s\S]*\$900[\s\S]*3\.6 million riel at 4,000 ៛/)
  })

  it("replaces the older versions: one 50/30/20, a 48-hour rule and no 72-hour one left to contradict it", () => {
    assert.equal(TIPS.filter((t) => /50\/30\/20|៥០\/៣០\/២០|៥០%/.test(t.body.km + t.title.km)).length, 1)
    assert.ok(!TIPS.some((t) => /៧២ ម៉ោង|72-hour/.test(t.title.km + t.title.en + t.body.km)))
    // The weekly digest names its tips by id: every one still exists (the 72-hour id became the 48-hour one).
    const ids = ["rule-50-30-20", "track-small-spending", "rule-48-hours", "emergency-fund", "separate-goals", "pay-yourself-first"]
    for (const id of ids) assert.ok(TIPS.some((t) => t.id === id), id)
    const tip = pickTip({ income: 100, net: 10, spendingChange: 50, savingsRate: 5 } as never, { workspace_type: "PERSONAL" } as never, "2026-10-19")
    assert.ok(["rule-48-hours", "track-small-spending"].includes(tip.id))
  })

  it("the 12:00 publisher reaches every rule: the «New tip» rotation goes through the whole series", () => {
    const seen = new Set<string>()
    let id: string | null = null
    for (let i = 0; i < TIPS.length; i++) seen.add((id = nextTip(id).id))
    for (const t of SERIES) assert.ok(seen.has(t.id), t.id)
  })

  it("the caption: the title, the hook and the three points, then the compact footer with «#របៀបចាយលុយឆ្លាត» — within the caption limit", () => {
    assert.deepEqual(tipSeriesTags("rule-48-hours"), ["#របៀបចាយលុយឆ្លាត"])
    assert.deepEqual(tipSeriesTags("emergency-fund"), [])
    for (const t of SERIES) {
      const caption = tipCaption({ tip_id: t.id, title: t.title.km, body: t.body.km })
      const footer = postFooter("community", "telegram", [SERIES_HASHTAGS["smart-spending"]])
      assert.ok(caption.endsWith(footer), `${t.id}: the footer is never dropped`)
      assert.ok(caption.includes("📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖") && caption.includes("👉 ចូលរួមសហគមន៍ ៖ @LuyChlatCommunity"))
      // Packed in short lines so no hashtag breaks on a phone (hashtagLines).
      assert.match(footer, /#LuyChlat #អេបលុយឆ្លាត\n#គ្រប់គ្រងហិរញ្ញវត្ថុ\n#របៀបចាយលុយឆ្លាត$/)
      assert.equal(points(caption).length, 3, `${t.id}: the points stay on their own lines`)
      assert.ok(caption.length <= 1024, `${t.id}: ${caption.length} characters`)
    }
    // A tip outside the series keeps the plain footer.
    const plain = TIPS.find((t) => t.id === "emergency-fund")!
    assert.ok(tipCaption({ tip_id: plain.id, title: plain.title.km, body: plain.body.km }).endsWith(postFooter("community")))
  })

  it("the poster keeps the v3 hierarchy: the hook as the lead, the last point as the gold takeaway", () => {
    const t = SERIES.find((x) => x.id === "market-list")!
    assert.deepEqual(splitTakeaway(t.body.km), {
      lead: "ចូលផ្សារទៅទិញតែស្ករ ចេញមកវិញដៃពេញថង់?",
      takeaway: "កុំដើរផ្សារពេលឃ្លានបាយ — ពោះឃ្លាន ធ្វើឱ្យភ្នែកចង់ទិញគ្រប់យ៉ាង។",
    })
    // An ordinary tip is split by sentence as before.
    assert.deepEqual(splitTakeaway("មួយ។ ពីរ។"), { lead: "មួយ។", takeaway: "ពីរ។" })
  })
})
