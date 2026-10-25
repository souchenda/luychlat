// GOLDEN GUARD — the @LuyChlatIslamic 24-hour lifecycle (founder, 18/10/2026). The slots, their days, the evening
// preview of the 05:30 post, and the approval gate (no slot is ever published by the timer unapproved).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { HijriDate } from "../../src/lib/islamic"
import { channelFor, isFastDay, ISLAMIC_KINDS, ISLAMIC_SCHEDULE, MORNING_PREVIEW_EVENING_MINUTE } from "../../src/lib/islamic-channel"
import { dueAction, plannedIslamicPosts, takeAllowed } from "../../src/lib/scheduled-posts"

const plain = (): HijriDate => ({ day: 15, month: 4, year: 1448 })
const ramadan = (): HijriDate => ({ day: 15, month: 9, year: 1448 })
const kinds = (day: string, minutes: number, hijriOf = plain) => plannedIslamicPosts(day, minutes, hijriOf).map((p) => `${p.kind}:${p.postKey}`)
const at = (h: number, m = 0) => h * 60 + m
// 2026-10-18 Sunday · 19 Monday · 20 Tuesday · 21 Wednesday · 22 Thursday · 23 Friday · 24 Saturday

describe("GOLDEN · the Islamic channel's 24-hour schedule", () => {
  it("the slots (Cambodia time)", () => {
    assert.deepEqual(ISLAMIC_SCHEDULE, {
      ISLAMIC_MORNING: at(5, 30),
      ISLAMIC_DAILY: at(8),
      ISLAMIC_JUMUAH: at(11, 30),
      ISLAMIC_IFTAR: at(17, 30),
      ISLAMIC_FAST: at(19),
      ISLAMIC_NIGHT: at(21),
    })
    assert.equal(MORNING_PREVIEW_EVENING_MINUTE, at(21, 30))
  })
  it("daily: 05:30 morning du'a, 08:00 lesson, 21:00 bedtime du'a — previewed 45 min before", () => {
    assert.ok(kinds("2026-10-20", at(4, 45)).includes("ISLAMIC_MORNING:2026-10-20"))
    // The 08:00 lesson — only one with its story context (founder's decision, 25/10/2026 — Task #498): 25/10 has its
    // story; 05/11 (lesson 1) has none yet, so no card is planned that day.
    assert.ok(kinds("2026-10-25", at(7, 15)).includes("ISLAMIC_DAILY:2026-10-25"))
    assert.ok(!kinds("2026-11-05", at(7, 15)).includes("ISLAMIC_DAILY:2026-11-05")) // lesson 1: no story yet
    // No quiz in the channel (founder, 20/10/2026 — a teaser without choices read as clickbait): the app only.
    for (let m = 0; m < 24 * 60; m += 15) assert.ok(!kinds("2026-10-20", m).some((k) => k.startsWith("ISLAMIC_QUIZ")), String(m))
    assert.ok(kinds("2026-10-20", at(20, 15)).includes("ISLAMIC_NIGHT:2026-10-20"))
    assert.ok(!kinds("2026-10-20", at(20, 14)).includes("ISLAMIC_NIGHT:2026-10-20")) // not before its preview time
  })
  it("the 05:30 post is previewed the evening before, from 21:30 (the founder approves before bed)", () => {
    assert.ok(kinds("2026-10-19", at(21, 30)).includes("ISLAMIC_MORNING:2026-10-20"))
    assert.ok(!kinds("2026-10-19", at(21, 29)).includes("ISLAMIC_MORNING:2026-10-20"))
    const p = plannedIslamicPosts("2026-10-19", at(21, 30), plain).find((x) => x.kind === "ISLAMIC_MORNING")!
    assert.equal(p.publishMinute, 24 * 60 + at(5, 30)) // tomorrow 05:30
  })
  it("Friday 11:30 Jumu'ah; Sunday / Wednesday 19:00 the fast reminder; 17:30 iftar on Monday / Thursday", () => {
    assert.ok(kinds("2026-10-23", at(11)).includes("ISLAMIC_JUMUAH:2026-10-23"))
    assert.ok(!kinds("2026-10-22", at(11)).includes("ISLAMIC_JUMUAH:2026-10-22"))
    assert.ok(kinds("2026-10-18", at(18, 15)).includes("ISLAMIC_FAST:2026-10-18"))
    assert.ok(kinds("2026-10-21", at(18, 15)).includes("ISLAMIC_FAST:2026-10-21"))
    assert.ok(kinds("2026-10-19", at(16, 45)).includes("ISLAMIC_IFTAR:2026-10-19"))
    assert.ok(kinds("2026-10-22", at(16, 45)).includes("ISLAMIC_IFTAR:2026-10-22"))
    assert.ok(!kinds("2026-10-20", at(16, 45)).includes("ISLAMIC_IFTAR:2026-10-20")) // Tuesday
  })
  it("in Ramadan the iftar du'a every day; never on Eid al-Fitr or the days of Eid al-Adha", () => {
    assert.ok(kinds("2026-10-20", at(16, 45), ramadan).includes("ISLAMIC_IFTAR:2026-10-20"))
    assert.equal(isFastDay("2026-10-19", { day: 1, month: 10, year: 1448 }), false) // a Monday on Eid al-Fitr
    assert.equal(isFastDay("2026-10-22", { day: 11, month: 12, year: 1448 }), false) // a Thursday in Tashreeq
  })
  it("every slot goes to the Islamic channel only, and through the approval gate", () => {
    for (const k of ISLAMIC_KINDS) assert.equal(channelFor(k), "islamic", k)
    assert.equal(dueAction(new Date(Date.now() - 60_000).toISOString(), Date.now(), "PENDING"), "hold") // not approved → never by the timer
    assert.equal(takeAllowed("PENDING", "PUBLISHED", false), false)
  })
  it("the database accepts every kind; the publisher draws each from the shared glossary content", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270176000000_islamic_lifecycle_posts.sql"), "utf8")
    for (const k of ISLAMIC_KINDS) assert.ok(sql.includes(`'${k}'`), k)
    const channel = readFileSync(join(process.cwd(), "src/lib/islamic-channel.ts"), "utf8")
    assert.match(channel, /from "@\/lib\/islamic\/glossary"/)
    assert.match(channel, /from "@\/lib\/duas"/) // the du'as are the app's own (lib/duas.ts)
  })
})
