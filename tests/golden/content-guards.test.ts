// GOLDEN GUARD — published wording (founder, 18/10/2026). The build fails when a quote, tip or spotlight line
// holds a phrase the founder banned, or when a public caption italicises Khmer (Khmer script distorts when
// slanted).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { MORNING_QUOTES } from "../../src/lib/morning"
import { SPOTLIGHT_CALL, SPOTLIGHT_HOOK, SPOTLIGHT_PILLARS } from "../../src/lib/spotlight"
import { TIPS } from "../../src/lib/tips"
import { ISLAMIC_TIPS } from "../../src/lib/islamic-tips"
import { MONEY_DILEMMAS } from "../../src/lib/money-dilemmas"
import { islamicCaptionHtml, islamicPostContent, ISLAMIC_KINDS } from "../../src/lib/islamic-channel"

/** Banned anywhere in published wording (founder, 18/10/2026). */
const BANNED = ["ធនាគារឪពុកម្តាយ", "បង់ពេញចំនួន", "តាក់ស៊ី"]

/** Every line the channel and the Page publish from the datasets. */
const lines: { where: string; text: string; title?: boolean }[] = [
  ...MORNING_QUOTES.map((q, i) => ({ where: `morning day ${i + 1}`, text: q, title: true })),
  ...[...TIPS, ...ISLAMIC_TIPS].flatMap((t) => [
    { where: `tip ${t.id} title`, text: t.title.km, title: true },
    { where: `tip ${t.id} body`, text: t.body.km },
  ]),
  ...MONEY_DILEMMAS.flatMap((d) => [
    { where: `dilemma ${d.id} title`, text: d.title, title: true },
    { where: `dilemma ${d.id} story`, text: `${d.story} ${d.question}` },
  ]),
  { where: "spotlight hook", text: SPOTLIGHT_HOOK, title: true },
  { where: "spotlight call", text: SPOTLIGHT_CALL },
  ...SPOTLIGHT_PILLARS.map((p, i) => ({ where: `spotlight pillar ${i + 1}`, text: JSON.stringify(p) })),
]

describe("GOLDEN · published wording", () => {
  it("no banned phrase in any morning quote, tip or spotlight line", () => {
    for (const l of lines) for (const b of BANNED) assert.ok(!l.text.includes(b), `${l.where} contains the banned «${b}»: ${l.text}`)
  })
  it("no title or quote opens with a dangling «ឬ »", () => {
    for (const l of lines.filter((x) => x.title)) assert.ok(!/^\s*ឬ\s/.test(l.text), `${l.where} starts with «ឬ »: ${l.text}`)
  })
  it("the guard itself catches them (it is not looking at an empty set)", () => {
    assert.ok(lines.length > 40)
    assert.ok(BANNED.some((b) => "… ធនាគារឪពុកម្តាយ …".includes(b)))
  })
  it("public captions never italicise (no <i> in the channel / Page senders)", () => {
    for (const file of ["lib/server/community-routine.ts", "lib/server/tip-bot.ts", "lib/server/scheduled-posts.ts", "lib/server/facebook-publisher.ts", "lib/holiday-lifecycle.ts", "lib/atm.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", file), "utf8")
      assert.doesNotMatch(src, /<i>|<em>/, `${file} italicises text`)
    }
  })
  it("@LuyChlatIslamic: the founder's Islamic terms, never the machine words (18/10/2026)", () => {
    const MACHINE = ["ឈប់ញ៉ាំ", "បើកបួស", "ស្ទូហួរ", "ស៊ូហួរ", "ជុមអះ", "ម.ស."]
    const hijri = { day: 8, month: 5, year: 1448 }
    for (const kind of ISLAMIC_KINDS)
      for (const d of ["2026-10-18", "2026-10-21", "2026-10-23"]) {
        const c = islamicPostContent(kind, d, hijri)
        const text = [islamicCaptionHtml(c), ...(c.posterParagraphs ?? []), c.pill, c.title, c.hijriShort ?? ""].join("\n")
        for (const bad of MACHINE) assert.ok(!text.includes(bad), `${kind} ${d}: «${bad}»`)
      }
  })
  it("@LuyChlatIslamic fast reminder: dated the day it is posted, titled for tomorrow; «ហូបបាយបួស (សាហួរ)», never «អាហារសាហួរ» (founder, 18/10/2026 evening)", () => {
    const today = { day: 7, month: 5, year: 1448 }
    for (const kind of ISLAMIC_KINDS)
      for (const d of ["2026-10-18", "2026-10-21", "2026-10-23"]) {
        const c = islamicPostContent(kind, d, today)
        assert.ok(!(c.pill + c.title + islamicCaptionHtml(c)).includes("អាហារសាហួរ"), `${kind} ${d}: «អាហារសាហួរ»`)
      }
    const sunday = islamicPostContent("ISLAMIC_FAST", "2026-10-18", today)
    // The poster's hero is short and one line; «tomorrow» is in the pill and the caption; the Arabic on its own line
    // (founder, 18/10/2026 typography hotfix — the long title wrapped and split the Arabic).
    assert.equal(sunday.title, "បួសស៊ុណ្ណា ថ្ងៃច័ន្ទ")
    assert.equal(sunday.pill, "រំលឹកត្រៀមបួសស្អែក")
    assert.equal(sunday.arabic, "صِيَام الإِثْنَيْن")
    assert.equal(islamicPostContent("ISLAMIC_FAST", "2026-10-21", today).title, "បួសស៊ុណ្ណា ថ្ងៃព្រហស្បតិ៍")
    assert.equal(islamicPostContent("ISLAMIC_FAST", "2026-10-21", today).arabic, "صِيَام الخَمِيس")
    assert.equal(sunday.posterDate, "ថ្ងៃអាទិត្យ ១៨ តុលា ២០២៦ · ៧ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ហ.ស.") // the publish day
    assert.equal(islamicPostContent("ISLAMIC_FAST", "2026-10-21", today).date, "ថ្ងៃពុធ ២១ តុលា ២០២៦")
    assert.equal(sunday.fast?.day, "ថ្ងៃច័ន្ទ") // the boxes are tomorrow's
    const caption = islamicCaptionHtml(sunday)
    assert.ok(caption.startsWith("🌙 <b>ថ្ងៃទី០៧ ខែជូម៉ាដាល់អ៊ូឡា ឆ្នាំ១៤៤៨"), caption) // the caption is dated the same day
    assert.ok(caption.includes("🌙 <b>រំលឹកត្រៀមបួសស៊ុណ្ណា (សម្រាប់ថ្ងៃច័ន្ទ ស្អែកនេះ)៖</b>"), caption)
    assert.ok(caption.includes("សូមកុំភ្លេចក្រោកហូបបាយបួស (សាហួរ / السَّحُور) នៅទៀបភ្លឺ មុនម៉ោងអ៊ឹមសាក់ ០៤:២៣ និងតាំងចិត្តនីយ៉ាត់ (Niyyah / النِّيَّة) តាំងពីយប់នេះ។"))
  })
})

