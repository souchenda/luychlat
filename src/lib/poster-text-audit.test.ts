import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DUAS, posterMeaning } from "./duas"
import { POSTER_HOOKS } from "./islamic-channel"
import { ISLAMIC_TIPS } from "./islamic-tips"
import { MORNING_QUOTES } from "./morning"
import { SIL_BLESSING_LINES, SIL_CTA } from "./sil-poster"
import { SPOTLIGHT_CALL, SPOTLIGHT_HOOK, SPOTLIGHT_PILLARS } from "./spotlight"
import { TIPS } from "./tips"

/**
 * Every text a poster can draw (founder, 19/10/2026 — the full poster audit): no parentheses on a graphic (explanations
 * belong in the caption), and none of the word-for-word phrases the founder named.
 */
const LOANS = /ក្នុងនាមព្រះអង្គ|មានចេតនា|ការស្រេកទឹកបានបាត់/

function posterTexts(): [string, string][] {
  const rows: [string, string][] = []
  for (const t of TIPS) rows.push([`tip ${t.id} title`, t.title.km], [`tip ${t.id} body`, t.body.km])
  for (const t of ISLAMIC_TIPS) rows.push([`islamic tip ${t.id} title`, t.title.km], [`islamic tip ${t.id} body`, t.body.km])
  MORNING_QUOTES.forEach((q, i) => rows.push([`morning quote ${i}`, q]))
  rows.push(["spotlight hook", SPOTLIGHT_HOOK], ["spotlight call", SPOTLIGHT_CALL])
  for (const p of SPOTLIGHT_PILLARS) rows.push([`spotlight ${p.title}`, `${p.title} ${p.line} ${p.sub}`])
  SIL_BLESSING_LINES.forEach((l, i) => rows.push([`sil blessing ${i}`, l]))
  rows.push(["sil call", SIL_CTA])
  for (const [k, v] of Object.entries(POSTER_HOOKS)) for (const l of v) rows.push([`hook ${k}`, l])
  for (const d of DUAS) rows.push([`du'a ${d.id}`, posterMeaning(d)])
  return rows
}

describe("Poster audit — what a graphic may say (founder, 19/10/2026)", () => {
  it("no parentheses on any poster text", () => {
    const bad = posterTexts().filter(([, t]) => /[()]/.test(t))
    assert.deepEqual(bad, [])
  })
  it("no word-for-word phrases", () => {
    const bad = posterTexts().filter(([, t]) => LOANS.test(t))
    assert.deepEqual(bad, [])
  })
  it("covers every source (tips, lessons, quotes, spotlight, Sil day, hooks, du'as)", () => {
    assert.ok(posterTexts().length > 140)
  })
})
