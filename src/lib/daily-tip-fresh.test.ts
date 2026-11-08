import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { defaultTip, freshTip, titleKey, type UsedTip } from "./daily-tip"
import { TIPS } from "./tips"

const POOL = TIPS.filter((t) => t.topic !== "islamic")
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const card = TIPS.find((t) => t.title.km === "ប្រើប័ណ្ណមិនលើស ៣០%")!

describe("The 12:00 tip is always new (founder, 8/11/2026 — «គន្លឹះត្រូវតែថ្មីជានិច្ច»)", () => {
  it("regression: «ប្រើប័ណ្ណមិនលើស 30%» came back — a tip published on ANY earlier day is never picked again", () => {
    const day = "2026-11-08"
    const used: UsedTip[] = [{ tip_id: card.id, title: card.title.km, day: "2026-10-11" }]
    for (let d = 1; d <= 60; d++) {
      const date = new Date(Date.UTC(2026, 10, d)).toISOString().slice(0, 10)
      assert.notEqual(freshTip(date, used).tip.id, card.id, date)
    }
    // The same title typed with Latin digits (edited by hand) counts too.
    assert.notEqual(freshTip(day, [{ tip_id: null, title: "ប្រើប័ណ្ណមិនលើស 30%", day: "2026-10-11" }]).tip.id, card.id)
    assert.equal(titleKey("ប្រើប័ណ្ណមិនលើស ៣០%"), titleKey("ប្រើប័ណ្ណមិនលើស30%"))
  })
  it("nothing used → the day's usual tip; «🔄» → the next unused one, never the current", () => {
    const day = "2026-11-08"
    assert.equal(freshTip(day, []).tip.id, defaultTip(day).id)
    const first = freshTip(day, []).tip
    const next = freshTip(day, [{ tip_id: POOL[(POOL.indexOf(first) + 1) % POOL.length].id, title: "x", day: "2026-10-01" }], first.id).tip
    assert.notEqual(next.id, first.id)
    assert.equal(next.id, POOL[(POOL.indexOf(first) + 2) % POOL.length].id)
  })
  it("the pool exhausted: the one shown longest ago, and `repeat` says when — never a silent repeat", () => {
    const used: UsedTip[] = POOL.map((t, i) => ({ tip_id: t.id, title: t.title.km, day: `2026-09-${String(10 + (i % 20)).padStart(2, "0")}${i >= 20 ? "x" : ""}` }))
    const r = freshTip("2026-11-08", used)
    assert.ok(r.repeat)
    assert.equal(r.repeat!.day, "2026-09-10")
  })
  it("wired: the 10:30 draft and «🔄» both use the history; an unread history or a repeat is said in the review room", () => {
    const bot = read("src/lib/server/tip-bot.ts")
    assert.match(bot, /rpc\("bot_tip_used"/)
    assert.doesNotMatch(bot, /nextTip\(|defaultTip\(/)
    assert.match(bot, /if \(notice\) for \(const chat of await marketingChats\(\)\) await sendText\(chat, notice\)/)
    assert.match(read("supabase/migrations/20270300000000_tip_used.sql"), /t\.status = 'POSTED'/)
  })
})
