import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { MarketLive } from "@/lib/market-calc"

import { islamicBulletinHtml, islamicMarket } from "./market"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const market = {
  fetched_at: "2026-10-20T03:00:00Z",
  nbc: { date: "2026-10-20", usd_khr: 4012, khr_per: { USD: 4012 } },
  local_gold: { date: "2026-10-20", kilo: { sell: 4125, buy: 4100 }, jewelry: null, source: "csnj", fetched_at: "2026-10-20T03:00:00Z" },
  gold: { gold_spot: 3700, platinum_spot: 1000, updated_at: "2026-10-20T02:00:00Z", reference: {} },
} as unknown as MarketLive

describe("Rates, gold and the Zakat Nisab for the Islamic community (founder, 20/10/2026)", () => {
  it("SAR from the NBC dollar ÷ 3.75; gold per gram from today's Phnom Penh kilo gold; Nisab = 85 g, riel to 100 ៛", () => {
    const m = islamicMarket(market, "2026-10-20")
    assert.equal(m.usdKhr, 4012)
    assert.equal(m.sarKhr, 1070) // 4012 / 3.75 = 1069.9
    assert.deepEqual(m.gold, { perGram: 110, perChi: 412.5, perDamlung: 4125, source: "local", date: "2026-10-20" }) // 4125 / 37.5
    assert.deepEqual(m.nisab, { usd: 9350, khr: 37512200 }) // 85 × 110; 9350 × 4012 = 37,512,200
  })
  it("old local gold (over 3 days): the international spot price per gram, said so", () => {
    const m = islamicMarket({ ...market, local_gold: { ...market.local_gold!, date: "2026-10-10" } }, "2026-10-20")
    assert.equal(m.gold?.source, "spot")
    assert.equal(m.gold?.perGram, 118.96) // 3700 / 31.1034768
  })
  it("the channel bulletin: «អាស្សាឡាមុអាឡៃកុម បងប្អូន!», SAR, NBC, gold and Nisab, the app link; «និង» not «&»; no italics", () => {
    const html = islamicBulletinHtml(islamicMarket(market, "2026-10-20"), { hijri: "៨ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ហ.ស.", gregorian: "ថ្ងៃអង្គារ ២០ តុលា ២០២៦", appUrl: "https://app.luychlat.com/" })!
    assert.match(html, /^🌙 <b>ព្រឹត្តិបត្រហាងឆេងរូបិយប័ណ្ណ និងនីស៊បមាសហ្សាកាត់<\/b>\n📅 ៨ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ហ\.ស\. \(ត្រូវនឹង ថ្ងៃអង្គារ ២០ តុលា ២០២៦\)\n\n<b>អាស្សាឡាមុអាឡៃកុម បងប្អូន!<\/b>/)
    assert.match(html, /• 1 SAR ≈ 1,070 ៛\n• 1 USD = 3\.75 SAR \(\$100 ≈ 375 SAR\)/)
    assert.match(html, /• 1 USD = 4,012 ៛ \(អត្រាផ្លូវការ 20\/10\/2026\)/)
    assert.match(html, /• <b>កម្រិតនីស៊បហ្សាកាត់ \(មាស ៨៥ ក្រាម\) = \$9,350 \(~37,512,200 ៛\)<\/b>/)
    assert.match(html, /ℹ️ បញ្ជាក់៖ ប្រសិនបើបងប្អូនមានទ្រព្យសន្សំសរុបស្មើ ឬលើសពីកម្រិតនីស៊បនេះ/)
    assert.match(html, /🌐 https:\/\/app\.luychlat\.com\/islamic\n— អេប លុយឆ្លាត · សហគមន៍ឥស្លាម$/)
    assert.doesNotMatch(html, /<i>|ជំរាបសួរ| & /)
    assert.equal(islamicBulletinHtml(islamicMarket({ fetched_at: "x" } as MarketLive, "2026-10-20"), { hijri: "", gregorian: "", appUrl: "x" }), null) // no NBC rate → nothing
  })
  it("published only to @LuyChlatIslamic, automatically (factual), once a day after the NBC rate; the hub card above the Zakat calculator", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /if \(row\.kind === "ISLAMIC_BULLETIN"\) \{[\s\S]{0,200}const text = await islamicBulletinNow\(\)\s+if \(chat && text\) ids\.telegram = await sentText\(text, true\)/)
    const cb = read("src/lib/server/community-bulletin.ts")
    assert.match(cb, /if \(!islamicChannelConfigured\(\)\) return false/)
    assert.match(cb, /p_job: ISLAMIC_JOB, p_day: now\.day/)
    assert.match(cb, /await holdForApproval\("ISLAMIC_BULLETIN", now\.day, \{ day: now\.day \}\)/)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await sendIslamicBulletin\(\)/)
    assert.match(read("supabase/migrations/20270208000000_islamic_market_bulletin.sql"), /select p_kind in \('BULLETIN', 'RATES', 'ISLAMIC_MORNING', 'ISLAMIC_BULLETIN'\)/)
    const page = read("src/app/(app)/islamic/page.tsx")
    assert.ok(page.indexOf("<IslamicMarketCard") < page.indexOf('<section id="zakat"'))
    assert.match(page, /update\.mutate\(\s*\{ gold_price: perGram, nisab_basis: "GOLD" \}/)
  })
})
