import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { firstSentence, islamicCaptionHtml, islamicPostContent, ISLAMIC_KINDS, POSTER_CTA, posterCta, posterDateline, POSTER_HOOKS } from "@/lib/islamic-channel"
import type { HijriDate } from "@/lib/islamic"
import { ISLAMIC_TIPS } from "@/lib/islamic-tips"

import { balancedSplit, ISLAMIC_POSTER, islamicPosterReady, POSTER_TYPE, posterText, renderIslamicPoster } from "./islamic-poster"

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
    for (let i = 0; i < ISLAMIC_TIPS.length; i++) {
      const c = islamicPostContent("ISLAMIC_DAILY", day(i), h(7))
      const r = renderIslamicPoster(c)
      assert.equal(r.truncated, false, `lesson ${i}`)
      // A lesson in the Prophet's own words (lesson 14 — founder, 21/10/2026): the intro on one line, his words and the
      // du'a in up to three lines each.
      if (c.posterHookLines === 3) {
        assert.equal(r.type.hookLines.length, 3, `lesson ${i}`)
        assert.equal(r.type.hookLines[0].length, 1, `lesson ${i}: the intro on one line`)
        assert.ok(r.type.hookLines.every((l) => l.length <= 3), `lesson ${i}: ${JSON.stringify(r.type.hookLines)}`)
        continue
      }
      assert.ok(r.type.hookLines.every((l) => l.length <= 2), `lesson ${i}: ${JSON.stringify(r.type.hookLines)}`)
      // The principle and its takeaway, at most three lines in all (founder, 20/10/2026).
      assert.equal(r.type.hookLines.length, 2, `lesson ${i}`)
      assert.ok(r.type.hookLines.flat().length <= 3, `lesson ${i}: ${JSON.stringify(r.type.hookLines)}`)
    }
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
      ["ISLAMIC_FAST", "2026-10-18", "បួសស៊ុណ្ណះ ថ្ងៃច័ន្ទ"],
      ["ISLAMIC_FAST", "2026-10-21", "បួសស៊ុណ្ណះ ថ្ងៃព្រហស្បតិ៍"],
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
  it("the dateline: «Gregorian · ត្រូវនឹង Hijri» on one line, no parentheses; the Gregorian alone without a Hijri date", () => {
    const c = islamicPostContent("ISLAMIC_MORNING", "2026-10-19", h(8))
    assert.equal(posterDateline(c), "ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦ · ត្រូវនឹង ៨ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ.ស.")
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
  it("posters are hooks, captions explain (founder, 18/10/2026): no reading or paragraph on a poster, all of it in the caption", () => {
    for (const kind of ISLAMIC_KINDS)
      for (const d of ["2026-10-18", "2026-10-19", "2026-10-21", "2026-10-23"]) {
        const c = islamicPostContent(kind, d, h(8))
        if (!c.posterLines) continue // the kind is not posted that day (the content still exists)
        // One or two hooks; three only for a lesson in the Prophet's own words (the intro, his words, the du'a).
        assert.ok(c.posterLines.length >= 1 && c.posterLines.length <= (c.posterHookLines === 3 && kind === "ISLAMIC_DAILY" ? 3 : 2), `${kind} ${d}`)
        for (const l of c.posterLines) assert.doesNotMatch(l, /អានថា|អត្ថន័យ៖/, `${kind}: a reading on the poster`)
        const { truncated, type } = renderIslamicPoster(c)
        assert.equal(truncated, false, `${kind} ${d}`)
        assert.equal(type.body, 0, `${kind}: paragraphs drawn on the poster`)
        // Two lines at most — three only for the Iftar du'a's full meaning (founder, 19/10/2026).
        assert.ok(type.hookLines.every((l) => l.length <= (c.posterHookLines ?? 2)), `${kind}: ${JSON.stringify(type.hookLines)}`)
        assert.ok(type.quote! >= POSTER_TYPE.quoteFallback[POSTER_TYPE.quoteFallback.length - 1] && type.quote! < type.title, kind)
      }
    // The founder's hooks, word for word.
    assert.deepEqual(islamicPostContent("ISLAMIC_MORNING", "2026-10-19", h(8)).posterLines, ["អរគុណអល់ឡោះ ដែលបានផ្ដល់ដង្ហើមជីវិតឱ្យយើងជាថ្មី"])
    assert.deepEqual(islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", h(12)).posterLines, ["ផ្អាកការលក់ដូរមួយភ្លែត ដើម្បីទៅថ្វាយបង្គំជូម៉ាអះ", "ប្រាក់ចំណេញក្រោយពេលនោះ ទើបប្រកបដោយបារ៉ាកាត់ពិតប្រាកដ"])
    assert.deepEqual(islamicPostContent("ISLAMIC_FAST", "2026-10-18", h(7)).posterLines, ["ស្អែកជាថ្ងៃបួសស៊ុណ្ណះ · ថ្ងៃដែលអំពើរបស់មនុស្សត្រូវបានបង្ហាញ", "កុំភ្លេចហូបបាយបួស និងតាំងចិត្តនីយ៉ាត់យប់នេះ"])
    assert.deepEqual(POSTER_HOOKS.morning, ["អរគុណអល់ឡោះ ដែលបានផ្ដល់ដង្ហើមជីវិតឱ្យយើងជាថ្មី"])
    // The morning, the fasts and Jumu'ah: each hook on one line.
    for (const [k, d] of [["ISLAMIC_MORNING", "2026-10-19"], ["ISLAMIC_FAST", "2026-10-18"], ["ISLAMIC_FAST", "2026-10-21"], ["ISLAMIC_JUMUAH", "2026-10-23"]] as const)
      assert.ok(renderIslamicPoster(islamicPostContent(k, d, h(8))).type.hookLines.every((l) => l.length === 1), `${k} ${d}`)
    // The caption keeps the reading, the meaning, the hadith and the reminders.
    const morning = islamicCaptionHtml(islamicPostContent("ISLAMIC_MORNING", "2026-10-19", h(8)))
    assert.ok(morning.includes("អានថា៖") && morning.includes("អត្ថន័យ៖"))
    assert.ok(islamicCaptionHtml(islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", h(12))).includes("Surah Al-Kahf"))
    // The hadith in Yerny's verified wording (founder, 21/10/2026).
    assert.ok(islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", "2026-10-18", h(7))).includes("អំពើល្អទាំងឡាយត្រូវបានលើកយកទៅបង្ហាញនៅថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍"))
    // A lesson's poster: its principle and its money takeaway (founder, 20/10/2026); the whole lesson is in the caption.
    const lesson = islamicPostContent("ISLAMIC_DAILY", "2026-10-18", h(7))
    const tip = ISLAMIC_TIPS.find((t) => t.title.km === lesson.title)! // by its title: the caption may open with its story (Task #501)
    assert.deepEqual(lesson.posterLines, [tip.poster.principle, tip.poster.takeaway])
    assert.equal(firstSentence("មួយ។ ពីរ។"), "មួយ។")
    assert.equal(firstSentence("គ្មានខណ្ឌ"), "គ្មានខណ្ឌ")
  })
  it("a hook too long for one line splits in two balanced halves — at «·» when it has one, never an orphan word", async () => {
    const { createCanvas } = await import("@napi-rs/canvas")
    const { FAMILIES, loadFonts } = await import("./poster-kit")
    loadFonts()
    const ctx = createCanvas(1080, 200).getContext("2d")
    ctx.font = `500 44px ${FAMILIES}`
    assert.deepEqual(balancedSplit(ctx, "ស្អែកជាថ្ងៃបួសស៊ុណ្ណះ · ថ្ងៃដែលអំពើរបស់មនុស្សត្រូវបានបង្ហាញ", 864), ["ស្អែកជាថ្ងៃបួសស៊ុណ្ណះ", "ថ្ងៃដែលអំពើរបស់មនុស្សត្រូវបានបង្ហាញ"])
    const [a, b] = balancedSplit(ctx, "អ្នកមានគុណធម៌ គឺអ្នកដែលចាយមិនហួសហេតុ ហើយក៏មិនកំណាញ់ដែរ គឺនៅចំកណ្ដាល។", 864)
    assert.ok(Math.abs(ctx.measureText(a).width - ctx.measureText(b).width) < 300, `${a} | ${b}`)
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
    assert.match(sp, /return \{ png: poster\(\(\) => islamicPoster\(c\)\), body: stripHtml\(islamicCaptionHtml\(c\)\), review: c\.review \}/) // the preview is the poster too (+ the draft flag, Task #500)
  })
  it("lines never break a time («០៤:២៣») or an Islamic term («អ៊ឹមសាក់», «ស៊ុណ្ណះ»…) — the server font is wider than Windows'", async () => {
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


describe("The Iftar du'a in natural Khmer (founder, 19/10/2026)", () => {
  it("the master text (lib/duas.ts) is the founder's reading and meaning; the channel and the poster use it", async () => {
    const { DUAS } = await import("../duas")
    const iftar = DUAS.find((d) => d.id === "iftar")!
    assert.equal(iftar.phonetic, "ហ្សា-ហា-បាស-ហ្សា-ម៉ា-អ៊ុ, វ៉ាប-តាល់-ឡា-ទីល-អ៊ុ-រូ-ក, វ៉ា-សា-បា-តាល់-អាជ-រុ, អ៊ីន-ស្យា-អល់-ឡោះ") // the wasl joins (21/10/2026)
    assert.equal(iftar.km, "ភាពស្រេកទឹកបានរសាយបាត់ សរសៃឈាមទាំងឡាយបានទទួលសំណើមឡើងវិញ ហើយផលបុណ្យកុសលត្រូវបានបញ្ជាក់ជាប្រាកដ ប្រសិនបើអល់ឡោះទ្រង់សព្វព្រះទ័យ។")
    assert.equal(iftar.source, "Sunan Abi Dawud 2357")
    const c = islamicPostContent("ISLAMIC_IFTAR", "2026-10-19", h(7))
    assert.ok(c.paragraphs.includes(`អានថា៖ ${iftar.phonetic}`) && c.paragraphs.includes(`អត្ថន័យ៖ ${iftar.km}`))
    assert.equal(c.posterLines?.[0], iftar.poster) // the poster meaning, never parentheses
  })
  it("on the poster the meaning takes three balanced large lines — never cut, never shrunk to the fallback", () => {
    const r = renderIslamicPoster(islamicPostContent("ISLAMIC_IFTAR", "2026-10-19", h(7)))
    assert.equal(r.truncated, false)
    assert.equal(r.type.hookLines?.[0].length, 3)
    assert.ok(r.type.quote! >= POSTER_TYPE.quote[POSTER_TYPE.quote.length - 1], `quote ${r.type.quote}px`)
  })
})

describe("Lesson 14's poster and caption (founder, 21/10/2026 — Sahih al-Bukhari 2397)", () => {
  it("the poster quotes him: the intro, his words, the du'a — nothing cut; the caption is the reviewer's translation, under 1,024", async () => {
    const { islamicPostContent, islamicCaptionHtml } = await import("../islamic-channel")
    const { ISLAMIC_TIPS } = await import("../islamic-tips")
    const t = ISLAMIC_TIPS.find((x) => x.id === "isl-avoid-debt")!
    const c = islamicPostContent("ISLAMIC_DAILY", "2026-10-21", h(10))
    assert.equal(c.title, "គ្រោះថ្នាក់នៃការជំពាក់បំណុល")
    assert.deepEqual(c.posterLines, [t.hadith!.intro, t.hadith!.quote, t.hadith!.dua])
    assert.equal(c.posterHookLines, 3)
    assert.deepEqual(c.paragraphs, t.hadith!.caption)
    const r = renderIslamicPoster(c)
    assert.equal(r.truncated, false)
    assert.ok(r.type.hookLines!.flat().join(" ").includes("តាមពាក្យសន្យានៅពេលដែលគាត់បានសន្យា។»"))
    const caption = islamicCaptionHtml(c)
    assert.ok(caption.length <= 1024, `${caption.length}`)
    assert.match(caption, /📖 ប្រភព៖ <a href="https:\/\/sunnah\.com\/bukhari:2397">Sahih al-Bukhari 2397<\/a>/)
  })
})
