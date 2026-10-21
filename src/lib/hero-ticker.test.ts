import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"
import type { MarketLive } from "@/lib/market-calc"

import { fuelTickerText, heroTicker, khrText, tickerSecond } from "./hero-ticker"

const now = Date.parse("2026-10-21T12:00:00+07:00")
const market = {
  nbc: { date: "2026-10-21", usd_khr: 4012, khr_per: { USD: 4012 } },
  local_gold: { date: "2026-10-21", kilo: { sell: 4125, buy: 4100 }, jewelry: null, source: "csnj", fetched_at: "x" },
  gold: { gold_spot: 3700, platinum_spot: 1000, updated_at: "x", reference: { GOLD_24K: 4300 } },
  fuel: { regular: 5050, super: null, diesel: 5550, lpg: null, lpg_unit: "kg", from: "2026-10-21", to: "2026-11-01", source: "moc", updated_at: "x" },
} as unknown as MarketLive

describe("The hero ticker — fuel for a business, gold for a family (founder, 21/10/2026 — Task #438)", () => {
  it("Business: NBC $1 = 4,012៛ · សាំង 5,050៛ · ម៉ាស៊ូត 5,550៛ — no gold", () => {
    const biz = heroTicker(market, "BUSINESS", now)
    assert.equal(biz.gold, null)
    assert.deepEqual([biz.usdKhr, biz.fuel?.regular, biz.fuel?.diesel, biz.fuel?.ended], [4012, 5050, 5550, false])
    const km = dictionaries.km
    assert.equal(`NBC $1 = ${khrText(biz.usdKhr!)} · ${fuelTickerText(biz.fuel!, { regular: km["market.tickerRegular"], diesel: km["market.tickerDiesel"] })}`, "NBC $1 = 4,012៛ · សាំង 5,050៛ · ម៉ាស៊ូត 5,550៛")
  })
  it("Personal and Family keep the gold: the kilo price when recent, else the 24K reference — no fuel", () => {
    for (const type of ["PERSONAL", "FAMILY", null] as const) {
      const t = heroTicker(market, type, now)
      assert.deepEqual([t.fuel, t.gold], [null, { usd: 4125, local: true }], String(type))
    }
    assert.deepEqual(heroTicker({ ...market, local_gold: { ...market.local_gold!, date: "2026-10-10" } }, "PERSONAL", now).gold, { usd: 4300, local: false })
    assert.deepEqual([tickerSecond("BUSINESS"), tickerSecond("PERSONAL")], ["fuel", "gold"])
  })
  it("never a silent stale price: an ended MoC cycle still shows (it stands until the next notice), flagged for the tooltip", () => {
    const t = heroTicker({ ...market, fuel: { ...market.fuel!, from: "2026-10-01", to: "2026-10-10" } }, "BUSINESS", now)
    assert.equal(t.fuel?.ended, true)
    assert.match(readFileSync("src/components/dashboard/market-rates-card.tsx", "utf8"), /fuel\.ended \? ` · \$\{t\("market\.tickerFuelEnded"\)\}`/)
    // No fuel known: the NBC rate alone.
    assert.deepEqual(heroTicker({ ...market, fuel: undefined }, "BUSINESS", now), { usdKhr: 4012, gold: null, fuel: null })
  })
  it("wired: the home hero passes the workspace type to the ticker", () => {
    assert.match(readFileSync("src/app/(app)/home/page.tsx", "utf8"), /footer=\{<MarketRatesCard workspaceType=\{workspace\?\.type\} \/>\}/)
  })
})
