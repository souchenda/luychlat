import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { islamicCaptionHtml, islamicPostContent, ISLAMIC_KINDS } from "@/lib/islamic-channel"
import type { HijriDate } from "@/lib/islamic"
import { ISLAMIC_TIPS } from "@/lib/islamic-tips"

import { ISLAMIC_POSTER, islamicPosterReady, posterText, renderIslamicPoster } from "./islamic-poster"

const h = (day: number, month = 5): HijriDate => ({ day, month, year: 1448 })
/** Width and height from a PNG's IHDR chunk. */
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]
const day = (i: number) => new Date(Date.UTC(2026, 9, 18 + i)).toISOString().slice(0, 10)

describe("@LuyChlatIslamic posters — every post is a poster with its caption (founder, 18/10/2026)", () => {
  before(() => islamicPosterReady)

  it("each kind renders a 1080 × 1350 PNG", () => {
    for (const kind of ISLAMIC_KINDS) {
      const { png } = renderIslamicPoster(islamicPostContent(kind, "2026-10-18", h(7), h(8)))
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", kind)
      assert.deepEqual(size(png), [ISLAMIC_POSTER.W, ISLAMIC_POSTER.H], kind)
      assert.ok(png.length > 50_000, kind)
    }
  })
  it("nothing is ever cut («…»): all 14 lessons, the fast reminder (Sunday and Wednesday) and Jumu'ah", () => {
    for (let i = 0; i < ISLAMIC_TIPS.length; i++) assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_DAILY", day(i), h(7))).truncated, false, `lesson ${i}`)
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_FAST", "2026-10-18", null, h(8))).truncated, false, "fast (Sunday)")
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_FAST", "2026-10-21", null, h(11))).truncated, false, "fast (Wednesday)")
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", h(12))).truncated, false, "jumuah")
  })
  it("every caption fits a Telegram photo caption (1024)", () => {
    for (let i = 0; i < ISLAMIC_TIPS.length; i++) assert.ok(islamicCaptionHtml(islamicPostContent("ISLAMIC_DAILY", day(i), h(7))).replace(/<[^>]+>/g, "").length <= 1024)
    for (const kind of ISLAMIC_KINDS) assert.ok(islamicCaptionHtml(islamicPostContent(kind, "2026-10-18", h(7), h(8))).replace(/<[^>]+>/g, "").length <= 1024, kind)
  })
  it("the fast poster names the place of its Imsak / Iftar times; «ﷺ» is written in Arabic letters on the poster", () => {
    const c = islamicPostContent("ISLAMIC_FAST", "2026-10-18", null, h(8))
    assert.equal(c.fast?.place, "ភ្នំពេញ")
    assert.match(c.fast!.imsak, /^[០-៩]{2}:[០-៩]{2}$/)
    assert.doesNotMatch(posterText("ព្យាការី ﷺ តែង"), /ﷺ/)
    assert.match(islamicCaptionHtml(c), /ﷺ/) // the caption keeps it (phones show it)
  })
  it("published as sendPhoto with the caption — never text-only (text only if the image fails)", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /if \(chat\) ids\.telegram = \(await sendPosterPhoto\(chat, islamicPoster\(c\), caption, \{ reply_markup: buttons\.reply_markup \}\)\) \?\? \(await sentText\(caption, true\)\)/)
    assert.match(sp, /return \{ png: poster\(\(\) => islamicPoster\(c\)\), body: stripHtml\(islamicCaptionHtml\(c\)\) \}/) // the preview is the poster too
  })
})
