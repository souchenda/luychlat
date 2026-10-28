import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { EVENING_RATES_WEEKDAYS, EVENING_WEEKDAYS, plannedPosts, SILENT_KINDS, silentPost } from "../scheduled-posts"
import { isQuiet, quietly } from "./quiet-post"

const src = (f: string) => readFileSync(join(process.cwd(), "src/lib/server", f), "utf8")

describe("members never feel disturbed (founder, 28/10/2026)", () => {
  it("everyday posts arrive without a sound; what a member must not miss still rings", () => {
    for (const k of ["MORNING", "BULLETIN", "RATES", "ISLAMIC_BULLETIN", "ISLAMIC_MORNING", "ISLAMIC_DAILY", "ISLAMIC_NIGHT"]) assert.ok(silentPost(k), k)
    for (const k of ["HOLIDAY", "NATIONAL_DAY", "POSTER", "HOLYDAY", "FUEL", "DILEMMA", "SPOTLIGHT", "EVENING", "ISLAMIC_JUMUAH", "ISLAMIC_FAST", "ISLAMIC_IFTAR"])
      assert.ok(!silentPost(k), k)
    assert.equal(SILENT_KINDS.length, 7)
  })
  it("the quiet scope reaches everything awaited inside it, and nothing outside", async () => {
    assert.equal(isQuiet(), false)
    assert.equal(await quietly(async () => { await new Promise((r) => setTimeout(r, 1)); return isQuiet() }), true)
    assert.equal(isQuiet(), false)
  })
  it("every channel send honours it: tg, the poster upload, the scheduler and the 12:00 tip", () => {
    assert.match(src("telegram-bot.ts"), /if \(method\.startsWith\("send"\) && isQuiet\(\)\) payload = \{ \.\.\.payload, disable_notification: true \}/)
    assert.match(src("tip-bot.ts"), /if \(isQuiet\(\)\) form\.append\("disable_notification", "true"\)/)
    assert.match(src("tip-bot.ts"), /const msg = await quietly\(async \(\) => photo\(chat, await posterFor\(t\)/)
    assert.match(src("scheduled-posts.ts"), /quiet: \(row, fn\) => \(silentPost\(row\.kind\) \? quietly\(fn\) : fn\(\)\)/)
    assert.match(src("scheduled-posts.ts"), /const ids = await \(d\.quiet \? d\.quiet\(row, \(\) => d\.publish\(row\)\) : d\.publish\(row\)\)/)
  })
  it("fewer posts: the 20:00 check-in Monday / Wednesday / Sunday, the evening NBC rates Friday only", () => {
    assert.deepEqual([...EVENING_WEEKDAYS], [0, 1, 3])
    assert.deepEqual([...EVENING_RATES_WEEKDAYS], [5])
    // 2026-10-18 Sunday … 24 Saturday
    const evenings = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].filter((d) =>
      plannedPosts(d, 20 * 60).some((p) => p.kind === "EVENING"),
    )
    assert.deepEqual(evenings, ["2026-10-18", "2026-10-19", "2026-10-21"])
    assert.match(src("community-bulletin.ts"), /if \(!EVENING_RATES_WEEKDAYS\.includes\(now\.date\.getDay\(\)\)\) return/)
  })
})
