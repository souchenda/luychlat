import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { BULLETIN_DEADLINE, BULLETIN_FROM, bulletinDecision, HELD_NOTE, isWeekday, NBC_POLL_MS, nbcFresh, shouldPollMarket } from "./bulletin-timing"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const at = (h: number, m = 0) => h * 60 + m
const TODAY = "2026-10-21" // a Wednesday

describe("Only today's NBC rate is ever published (founder, 21/10/2026)", () => {
  it("regression: a stale rate is rejected — yesterday's, and the next working day's on a weekend; only today's is fresh", () => {
    assert.equal(nbcFresh("2026-10-21", TODAY), true)
    assert.equal(nbcFresh("2026-10-20", TODAY), false) // yesterday's closing rate
    assert.equal(nbcFresh("2026-10-26", "2026-10-24"), false) // Saturday showing Monday's rate
    assert.equal(nbcFresh(null, TODAY), false)
    for (const minutes of [at(8), at(9, 30), at(10), at(10, 59)])
      assert.notEqual(bulletinDecision({ minutes, today: TODAY, nbcDate: "2026-10-20", goldDate: TODAY }), "publish", `${minutes}`)
  })
  it("today's rate and today's gold in → published at once, from 08:00 (not waiting for 09:30)", () => {
    assert.equal(BULLETIN_FROM, at(8))
    assert.equal(bulletinDecision({ minutes: at(8, 5), today: TODAY, nbcDate: TODAY, goldDate: TODAY }), "publish")
    assert.equal(bulletinDecision({ minutes: at(7, 59), today: TODAY, nbcDate: TODAY, goldDate: TODAY }), "closed")
    // Today's rate, gold not yet published: wait for the shops (never yesterday's gold as today's)…
    assert.equal(bulletinDecision({ minutes: at(9), today: TODAY, nbcDate: TODAY, goldDate: "2026-10-20" }), "wait")
    // …until 10:00: then published, the gold dated (community-bulletin goldBlock, market.ts).
    assert.equal(BULLETIN_DEADLINE, at(10))
    assert.equal(bulletinDecision({ minutes: at(10), today: TODAY, nbcDate: TODAY, goldDate: "2026-10-20" }), "publish")
  })
  it("no rate for today by 10:00 (a bank holiday, NBC late) → held, never a substitute; after 11:00 nothing more that day", () => {
    assert.equal(bulletinDecision({ minutes: at(10), today: TODAY, nbcDate: "2026-10-20", goldDate: TODAY }), "hold")
    assert.equal(bulletinDecision({ minutes: at(10, 45), today: TODAY, nbcDate: TODAY, goldDate: TODAY }), "publish") // a server down at 10:00 catches up
    assert.equal(bulletinDecision({ minutes: at(11), today: TODAY, nbcDate: TODAY, goldDate: TODAY }), "closed")
    assert.equal(isWeekday(TODAY), true)
    assert.equal(isWeekday("2026-10-24"), false) // Saturday: held silently (a weekend has no rate of its own)
    assert.match(HELD_NOTE, /មិនផ្សាយអត្រាចាស់ជំនួសទេ/)
  })
  it("from 08:00 the market is fetched every 5 minutes while today's rate or gold is missing — never once both are in", () => {
    const base = { minutes: at(8, 10), today: TODAY, nbcDate: "2026-10-20", goldDate: "2026-10-20", lastPollAt: 0, now: NBC_POLL_MS }
    assert.equal(NBC_POLL_MS, 5 * 60_000)
    assert.equal(shouldPollMarket(base), true)
    assert.equal(shouldPollMarket({ ...base, lastPollAt: 1 }), false) // under 5 minutes since the last fetch
    assert.equal(shouldPollMarket({ ...base, nbcDate: TODAY }), true) // the gold still missing
    assert.equal(shouldPollMarket({ ...base, nbcDate: TODAY, goldDate: TODAY }), false) // complete
    assert.equal(shouldPollMarket({ ...base, minutes: at(7, 55) }), false)
    assert.equal(shouldPollMarket({ ...base, minutes: at(10) }), false)
  })
  it("both bulletins follow it; a held weekday tells the founder once; the old 09:30 window is gone", () => {
    const cb = read("src/lib/server/community-bulletin.ts")
    assert.equal(cb.match(/const \{ market, decision \} = await bulletinNow\(now\)/g)?.length, 2) // community and Islamic
    assert.match(cb, /if \(decision !== "publish"\) return false/)
    assert.match(cb, /if \(decision !== "publish" \|\| !market\?\.nbc\?\.usd_khr\) return false/)
    assert.match(cb, /if \(!isWeekday\(day\)\) return/)
    assert.match(cb, /p_job: "bulletin-held", p_day: day/)
    assert.match(cb, /founder told in \$\{sent\} chat\(s\)/)
    assert.doesNotMatch(cb, /const FROM = \{ hour: 9, minute: 30 \}|const DEADLINE = \{ hour: 10, minute: 30 \}/)
  })
})

describe("A gold price from another day is dated, never passed off as today's (founder, 21/10/2026)", () => {
  it("the community and the Islamic bulletins", async () => {
    const { goldBlock } = await import("@/lib/server/community-bulletin")
    const { islamicBulletinHtml, islamicMarket } = await import("@/lib/islamic/market")
    type M = Parameters<typeof goldBlock>[0]
    const market = {
      fetched_at: "x",
      nbc: { date: TODAY, usd_khr: 4012, khr_per: { USD: 4012 } },
      local_gold: { date: "2026-10-20", kilo: { sell: 4125, buy: 4100 }, jewelry: null, source: "csnj", fetched_at: "x" },
    } as unknown as M
    assert.match(goldBlock(market, TODAY).join("\n"), /🥇 <b>ហាងឆេងមាស ២៤K \(ផ្សារភ្នំពេញ · តម្លៃថ្ងៃ ២០\/១០\)<\/b>/)
    assert.doesNotMatch(goldBlock(market, "2026-10-20").join("\n"), /តម្លៃថ្ងៃ/) // today's: no date needed
    assert.match(islamicBulletinHtml(islamicMarket(market, TODAY), { hijri: "x", gregorian: "y", appUrl: "z" })!, / · តម្លៃថ្ងៃ 20\/10\)/)
  })
})
