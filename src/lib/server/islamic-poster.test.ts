import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { islamicCaptionHtml, islamicPostContent, ISLAMIC_KINDS, POSTER_CTA, posterCta, posterDateline } from "@/lib/islamic-channel"
import type { HijriDate } from "@/lib/islamic"
import { ISLAMIC_TIPS } from "@/lib/islamic-tips"

import { ISLAMIC_POSTER, islamicPosterReady, POSTER_TYPE, posterText, renderIslamicPoster } from "./islamic-poster"

const h = (day: number, month = 5): HijriDate => ({ day, month, year: 1448 })
/** Width and height from a PNG's IHDR chunk. */
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]
const day = (i: number) => new Date(Date.UTC(2026, 9, 18 + i)).toISOString().slice(0, 10)

describe("@LuyChlatIslamic posters — every post is a poster with its caption (founder, 18/10/2026)", () => {
  before(() => islamicPosterReady)

  it("each kind renders a 1080 × 1350 PNG", () => {
    for (const kind of ISLAMIC_KINDS) {
      const { png } = renderIslamicPoster(islamicPostContent(kind, "2026-10-18", h(7)))
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", kind)
      assert.deepEqual(size(png), [ISLAMIC_POSTER.W, ISLAMIC_POSTER.H], kind)
      assert.ok(png.length > 50_000, kind)
    }
  })
  it("nothing is ever cut («…»): all 14 lessons, the fast reminder (Sunday and Wednesday) and Jumu'ah", () => {
    for (let i = 0; i < ISLAMIC_TIPS.length; i++) assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_DAILY", day(i), h(7))).truncated, false, `lesson ${i}`)
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_FAST", "2026-10-18", null)).truncated, false, "fast (Sunday)")
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_FAST", "2026-10-21", null)).truncated, false, "fast (Wednesday)")
    assert.equal(renderIslamicPoster(islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", h(12))).truncated, false, "jumuah")
  })
  it("type hierarchy: the hero title is the largest text, then the Arabic, the text; the date is quiet metadata", () => {
    // The scale itself, largest first (founder, 18/10/2026 — the Hijri date had been drawn larger than the title).
    assert.ok(POSTER_TYPE.title[0] > POSTER_TYPE.arabic[0] && POSTER_TYPE.arabic[0] > POSTER_TYPE.bodyMax && POSTER_TYPE.bodyMax > POSTER_TYPE.dateline[0])
    assert.ok(POSTER_TYPE.dateline[0] <= 30) // ~11 px on a phone (the poster shows at ~⅓ of 1080 px)
    assert.ok(POSTER_TYPE.titleTwoLines > POSTER_TYPE.dateline[0])
    // Each render, as drawn: every kind on several days, all 14 lessons.
    const renders = [
      ...ISLAMIC_KINDS.map((k) => islamicPostContent(k, "2026-10-19", h(8))),
      islamicPostContent("ISLAMIC_FAST", "2026-10-18", h(7)),
      islamicPostContent("ISLAMIC_FAST", "2026-10-21", h(10)),
      islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", h(12)),
      ...ISLAMIC_TIPS.map((_, i) => islamicPostContent("ISLAMIC_DAILY", day(i), h(7))),
    ]
    for (const c of renders) {
      const { type } = renderIslamicPoster(c)
      const label = `${c.kind} «${c.title}»`
      assert.ok(type.title > type.dateline, label)
      assert.ok(type.title >= type.body, label)
      if (type.arabic !== null) assert.ok(type.title > type.arabic, label)
      if (type.titleArabic !== null) assert.ok(type.title > type.titleArabic && type.titleArabic > type.dateline, label)
      assert.ok(type.dateline >= 26 && type.dateline <= 30, label)
    }
  })
  it("the hero is one line, at full size, for the morning, the fast reminders and Jumu'ah; the Arabic stays whole", () => {
    const hero = [
      ["ISLAMIC_MORNING", "2026-10-19", "អរុណសួស្តីថ្ងៃថ្មី"],
      ["ISLAMIC_FAST", "2026-10-18", "បួសស៊ុណ្ណា ថ្ងៃច័ន្ទ"],
      ["ISLAMIC_FAST", "2026-10-21", "បួសស៊ុណ្ណា ថ្ងៃព្រហស្បតិ៍"],
      ["ISLAMIC_JUMUAH", "2026-10-23", "ជូម៉ាអះ មូបារ៉ក់"],
    ] as const
    for (const [kind, d, title] of hero) {
      const c = islamicPostContent(kind, d, h(8))
      assert.equal(c.title, title)
      const { type } = renderIslamicPoster(c)
      assert.equal(type.titleLines, 1, title)
      assert.equal(type.title, POSTER_TYPE.title[0], title)
    }
    // The Arabic companion is its own centred line under the hero, never part of a title that wraps.
    const companions = [
      ["ISLAMIC_MORNING", "2026-10-19", "صَبَاح الخَيْر"],
      ["ISLAMIC_FAST", "2026-10-18", "صِيَام يَوْم الإِثْنَيْن"],
      ["ISLAMIC_FAST", "2026-10-21", "صِيَام يَوْم الخَمِيس"],
      ["ISLAMIC_JUMUAH", "2026-10-23", "جُمُعَة مُبَارَك"],
    ] as const
    for (const [kind, d, arabic] of companions) {
      const c = islamicPostContent(kind, d, h(8))
      assert.equal(c.titleArabic, arabic)
      assert.doesNotMatch(c.title, /[\u0600-\u06FF]/)
      assert.equal(renderIslamicPoster(c).type.titleArabic, POSTER_TYPE.titleArabic[0], arabic) // full size, one line
    }
  })
  it("the dateline: «Gregorian (ត្រូវនឹង Hijri)» on one line; the Gregorian alone without a Hijri date", () => {
    const c = islamicPostContent("ISLAMIC_MORNING", "2026-10-19", h(8))
    assert.equal(posterDateline(c), "ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦ (ត្រូវនឹង ៨ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ហ.ស.)")
    assert.equal(posterDateline(islamicPostContent("ISLAMIC_MORNING", "2026-10-19", null)), "ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦")
    // The longest month name still fits one line at a dateline size.
    const longest = islamicPostContent("ISLAMIC_DAILY", "2026-09-30", { day: 29, month: 6, year: 1448 })
    assert.ok(renderIslamicPoster(longest).type.dateline >= POSTER_TYPE.dateline[POSTER_TYPE.dateline.length - 1])
  })
  it("a call to action above the links: listening to the Quran on the du'a posters, the Islamic features on the others", () => {
    assert.equal(posterCta("ISLAMIC_MORNING"), "ចូលស្ដាប់គួរអាន និងគណនាហ្សាកាត់ដោយឥតគិតថ្លៃ")
    assert.equal(posterCta("ISLAMIC_NIGHT"), POSTER_CTA.audio)
    for (const k of ["ISLAMIC_DAILY", "ISLAMIC_FAST", "ISLAMIC_JUMUAH", "ISLAMIC_IFTAR"] as const) assert.equal(posterCta(k), "ប្រើប្រាស់មុខងារឥស្លាម និងគ្រប់គ្រងលុយកាក់ដោយឥតគិតថ្លៃ", k)
    for (const k of ISLAMIC_KINDS) assert.equal(renderIslamicPoster(islamicPostContent(k, "2026-10-19", h(8))).type.cta, posterCta(k), k)
    const src = readFileSync(join(process.cwd(), "src/lib/server/islamic-poster.ts"), "utf8")
    assert.match(src, /footer\(ctx, type\.cta\)/)
  })
  it("Arabic is drawn with the bundled Amiri (public/fonts, SIL OFL), the same everywhere", async () => {
    for (const f of ["Amiri-Regular.ttf", "Amiri-Bold.ttf", "Amiri-OFL.txt"]) assert.ok(readFileSync(join(process.cwd(), "public/fonts", f)).length > 1000, f)
    const kit = readFileSync(join(process.cwd(), "src/lib/server/poster-kit.ts"), "utf8")
    assert.match(kit, /registerFromPath\(path\.join\(dir, `Amiri-\$\{w\}\.ttf`\), "Amiri"\)/)
    assert.match(kit, /export const ARABIC_FAMILIES = `"Amiri", \$\{FAMILIES\}`/)
    // Never for Arabic words inside Khmer text (Amiri broke «الجُمُعَة» in the pill) — only whole Arabic lines.
    const { FAMILIES } = await import("./poster-kit")
    assert.ok(!FAMILIES.includes("Amiri"), FAMILIES)
  })
  it("every caption fits a Telegram photo caption (1024)", () => {
    for (let i = 0; i < ISLAMIC_TIPS.length; i++) assert.ok(islamicCaptionHtml(islamicPostContent("ISLAMIC_DAILY", day(i), h(7))).replace(/<[^>]+>/g, "").length <= 1024)
    for (const kind of ISLAMIC_KINDS) assert.ok(islamicCaptionHtml(islamicPostContent(kind, "2026-10-18", h(7))).replace(/<[^>]+>/g, "").length <= 1024, kind)
  })
  it("the fast poster names the place of its Imsak / Iftar times; «ﷺ» stays the ligature on the poster (never spelled out)", () => {
    const c = islamicPostContent("ISLAMIC_FAST", "2026-10-18", null)
    assert.equal(c.fast?.place, "ភ្នំពេញ")
    assert.match(c.fast!.imsak, /^[០-៩]{2}:[០-៩]{2}$/)
    assert.equal(posterText("ព្យាការី ﷺ តែង"), "ព្យាការី ﷺ តែង")
    assert.doesNotMatch(readFileSync(join(process.cwd(), "src/lib/server/islamic-poster.ts"), "utf8"), /صلى الله عليه وسلم/)
    assert.match(islamicCaptionHtml(c), /ﷺ/) // the caption keeps it (phones show it)
  })
  it("published as sendPhoto with the caption — never text-only (text only if the image fails)", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /if \(chat\) ids\.telegram = \(await sendPosterPhoto\(chat, islamicPoster\(c\), caption, \{ reply_markup: buttons\.reply_markup \}\)\) \?\? \(await sentText\(caption, true\)\)/)
    assert.match(sp, /return \{ png: poster\(\(\) => islamicPoster\(c\)\), body: stripHtml\(islamicCaptionHtml\(c\)\) \}/) // the preview is the poster too
  })
  it("lines never break a time («០៤:២៣») or an Islamic term («អ៊ឹមសាក់», «ស៊ុណ្ណា»…) — the server font is wider than Windows'", async () => {
    const { createCanvas } = await import("@napi-rs/canvas")
    const { FAMILIES, loadFonts, wrap } = await import("./poster-kit")
    loadFonts()
    const ctx = createCanvas(1080, 200).getContext("2d")
    ctx.font = `400 31px ${FAMILIES}`
    const text = "សូមកុំភ្លេចក្រោកហូបបាយបួស (សាហួរ) នៅទៀបភ្លឺ មុនម៉ោងអ៊ឹមសាក់ ០៤:២៣ និងតាំងចិត្តនីយ៉ាត់ តាំងពីយប់នេះ។"
    for (let width = 260; width <= 900; width += 7) {
      const lines = wrap(ctx, text, width, 99)
      for (const [i, l] of lines.entries()) {
        const next = lines[i + 1] ?? ""
        assert.ok(!(l.endsWith("អ៊ឹម") && next.startsWith("សាក់")), `អ៊ឹម|សាក់ at ${width}`)
        assert.ok(!/[0-9០-៩]:?$/.test(l) || !/^:?[0-9០-៩]/.test(next), `a time broken at ${width}: «${l}» | «${next}»`)
      }
    }
  })
})

