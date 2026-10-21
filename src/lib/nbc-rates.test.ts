import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MarketLive } from "@/lib/market-calc"

import { nbcRateItems, nbcRateRows, nbcRatesBlock, RATE_ORDER } from "./nbc-rates"

const market = {
  fetched_at: "2026-10-21T03:00:00Z",
  nbc: { date: "2026-10-21", usd_khr: 4012, khr_per: { USD: 4012, THB: 123.45, MYR: 951.2, CNY: 563.1, EUR: 4675, VND: 0.158 } },
  local_gold: { date: "2026-10-21", kilo: { sell: 4125, buy: 4100 }, jewelry: null, source: "csnj", fetched_at: "x" },
  gold: { gold_spot: 3700, platinum_spot: 1000, updated_at: "2026-10-21T02:00:00Z", reference: {} },
  fuel: { regular: 4100, super: null, diesel: 4250, from: "2026-10-21", to: "2026-10-31", source: "moc", updated_at: "x" },
} as unknown as MarketLive

describe("One NBC table for both channels (founder, 21/10/2026)", () => {
  it("USD, THB, MYR, CNY, EUR, VND — the baht and the ringgit near the top; aligned; a small unit per 1,000", () => {
    assert.deepEqual([...RATE_ORDER], ["USD", "THB", "MYR", "CNY", "EUR", "VND"])
    assert.deepEqual(nbcRateRows(market.nbc!), [
      "🇺🇸 1 USD       =  4,012 ៛",
      "🇹🇭 1 THB       =    123 ៛",
      "🇲🇾 1 MYR       =    951 ៛",
      "🇨🇳 1 CNY       =    563 ៛",
      "🇪🇺 1 EUR       =  4,675 ៛",
      "🇻🇳 1,000 VND   =    158 ៛",
    ])
    assert.equal(nbcRatesBlock({ khr_per: { USD: 4012 } }), "<pre>🇺🇸 1 USD       =  4,012 ៛</pre>") // a missing currency is left out
  })
})

describe("The community bulletin: rates, gold in ជី / តម្លឹង, MoC fuel, the compact footer (founder, 21/10/2026)", () => {
  it("every block, in order, from today's data", async () => {
    const { bulletinText } = await import("@/lib/server/community-bulletin")
    const text = bulletinText(new Date("2026-10-21T03:00:00Z"), market)
    for (const part of [
      "🇹🇭 1 THB       =    123 ៛",
      "🇲🇾 1 MYR       =    951 ៛",
      "🥇 <b>ហាងឆេងមាស ២៤K (ផ្សារភ្នំពេញ)</b>\n• ១ ជី ≈ $413 · ១ តម្លឹង ≈ $4,125",
      "⛽ <b>តម្លៃប្រេងឥន្ធនៈ (ក្រសួងពាណិជ្ជកម្ម)</b>\n• សាំងធម្មតា (EA92) ៖ 4,100 ៛/លីត្រ\n• ម៉ាស៊ូត (Diesel) ៖ 4,250 ៛/លីត្រ",
    ])
      assert.ok(text.includes(part), part)
    assert.ok(text.indexOf("<pre>") < text.indexOf("🥇") && text.indexOf("🥇") < text.indexOf("⛽")) // rates, gold, fuel
    assert.ok(text.endsWith("@LuyChlatCommunity #LuyChlat\n#អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ"))
    assert.doesNotMatch(text, /តម្លៃវដ្តមុន/) // the cycle is current
  })
  it("never a silent stale figure: an ended MoC cycle says so; old local gold falls back to the 24K reference, named", async () => {
    const { bulletinText } = await import("@/lib/server/community-bulletin")
    const stale = { ...market, fuel: { ...market.fuel!, from: "2026-10-01", to: "2026-10-10" }, local_gold: { ...market.local_gold!, date: "2026-10-10" } } as MarketLive
    const text = bulletinText(new Date("2026-10-21T03:00:00Z"), stale)
    assert.match(text, /ℹ️ តម្លៃវដ្តមុន — មិនទាន់មានសេចក្តីជូនដំណឹងថ្មីពីក្រសួងពាណិជ្ជកម្ម/)
    assert.match(text, /🥇 <b>ហាងឆេងមាស ២៤K \(តម្លៃយោងអន្តរជាតិ\)<\/b>/)
    // No fuel, no gold: those blocks are left out, the rest stays.
    const bare = bulletinText(new Date("2026-10-21T03:00:00Z"), { ...market, fuel: undefined, local_gold: null, gold: null } as unknown as MarketLive)
    assert.doesNotMatch(bare, /🥇|⛽/)
    assert.match(bare, /<pre>🇺🇸 1 USD/)
  })
})

describe("The Islamic bulletin carries the same full table (founder, 21/10/2026)", () => {
  it("THB and MYR beside the dollar; the riyal for Hajj and Umrah in the same list; the gold in Cambodian units", async () => {
    const { islamicBulletinHtml, islamicMarket } = await import("@/lib/islamic/market")
    const html = islamicBulletinHtml(islamicMarket(market, "2026-10-21"), { hijri: "x", gregorian: "y", appUrl: "https://app.luychlat.com" })!
    // The same currencies as the community table, as one list with the riyal after the dollar (founder, 21/10/2026).
    for (const i of nbcRateItems(market.nbc!)) assert.ok(html.includes(`• ${i.flag} ${i.label} = ${i.value} ៛`), i.code)
    assert.ok(html.indexOf("• 🇺🇸 1 USD") < html.indexOf("• 🇸🇦 1 SAR") && html.indexOf("• 🇸🇦 1 SAR") < html.indexOf("• 🇹🇭 1 THB"))
    assert.ok(html.includes("• 🇸🇦 1 SAR ≈ 1,070 ៛ (1 USD = 3.75 SAR · សម្រាប់ធ្វើរូកូន ហាជ និងអ៊ុមរ៉ោះ)"))
    assert.match(html, /• ហាងឆេងមាស ២៤K ៖ ១ ជី ≈ \$413 · ១ តម្លឹង ≈ \$4,125/)
    assert.match(html, /≈ ២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី/)
  })
})
