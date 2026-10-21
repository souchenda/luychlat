import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { MarketLive } from "@/lib/market-calc"

import { HIJRI_MONTHS_KM } from "@/lib/islamic"

import { goldReference, goldUnitsLine, GRAMS_PER_HUN, GRAMS_PER_LI, islamicBulletinHtml, islamicMarket, khmerGoldWeight, nisabCheck, ZAKAT_RATE } from "./market"

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
    const html = islamicBulletinHtml(islamicMarket(market, "2026-10-20"), { hijri: "៨ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ.ស.", gregorian: "ថ្ងៃអង្គារ ២០ តុលា ២០២៦", appUrl: "https://app.luychlat.com/" })!
    assert.match(html, /^🌙 <b>ព្រឹត្តិបត្រហាងឆេងរូបិយប័ណ្ណ និងនីស៊បមាសហ្សាកាត់<\/b>\n📅 ៨ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ\.ស\. \(ត្រូវនឹង ថ្ងៃអង្គារ ២០ តុលា ២០២៦\)\n\n<b>អាស្សាឡាមុអាឡៃកុម បងប្អូន!<\/b>/)
    assert.match(html, /• 1 SAR ≈ 1,070 ៛\n• 1 USD = 3\.75 SAR \(\$100 ≈ 375 SAR\)/)
    // The full NBC table, as in the community bulletin (founder, 21/10/2026) — here only USD is in the test market.
    assert.match(html, /💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ ធនាគារជាតិនៃកម្ពុជា \(NBC\)<\/b> · 20\/10\/2026\n<pre>🇺🇸 1 USD {7}= {2}4,012 ៛<\/pre>/)
    // The Nisab in Cambodian units too (founder, 21/10/2026): 85 g ≈ ២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី.
    assert.match(html, /• <b>កម្រិតនីស៊បហ្សាកាត់ \(មាស ៨៥ ក្រាម ≈ ២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី\) = \$9,350 \(~37,512,200 ៛\)<\/b>/)
    assert.match(html, /ℹ️ បញ្ជាក់៖ ប្រសិនបើបងប្អូនមានទ្រព្យសន្សំសរុបស្មើ ឬលើសពីកម្រិតនីស៊បនេះ/)
    // Gold per gram, chi and damlung; the compact one-line Islamic footer last (founder, 21/10/2026).
    // Cambodian units first, the gram in brackets, then where the price comes from (founder, 21/10/2026).
    assert.match(html, /• ហាងឆេងមាស ២៤K ៖ ១ ជី ≈ \$413 · ១ តម្លឹង ≈ \$4,125 \(១ ក្រាម ≈ \$110\.00\)\n {2}\(តម្លៃយោងមាសគីឡូ ២៤K ផ្សារភ្នំពេញ · ទីផ្សារជាក់ស្តែងតាមហាងនីមួយៗអាចមានគម្លាតខុសគ្នាបន្តិចបន្តួច\)/)
    assert.ok(html.indexOf("១ ជី ≈") < html.indexOf("១ ក្រាម ≈")) // never by the gram first
    assert.match(html, /🌐 https:\/\/app\.luychlat\.com\/islamic\n— អេប លុយឆ្លាត · សហគមន៍ឥស្លាម\n@LuyChlatIslamic #LuyChlatIslamic\n#អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់$/) // two short lines: no hashtag broken on a phone
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

describe("The Nisab quick check and the month's spelling (founder, 21/10/2026)", () => {
  const m = islamicMarket(market, "2026-10-20") // Nisab $9,350; 1 USD = 4,012 ៛
  it("in dollars: below the Nisab — nothing due; at or above — 2.5%, with the riel to 100 ៛", () => {
    assert.equal(ZAKAT_RATE, 0.025)
    assert.deepEqual(nisabCheck(m, 5000, "USD"), { usd: 5000, meets: false, zakatUsd: 0, zakatKhr: 0 })
    assert.deepEqual(nisabCheck(m, 9350, "USD"), { usd: 9350, meets: true, zakatUsd: 233.75, zakatKhr: 937800 }) // 233.75 × 4012 = 937,805 → 937,800
    assert.deepEqual(nisabCheck(m, 12000, "USD"), { usd: 12000, meets: true, zakatUsd: 300, zakatKhr: 1203600 })
  })
  it("in riel: converted at the NBC rate to compare; the riel due from the riel itself (100 ៛ rounding)", () => {
    const r = nisabCheck(m, 48_000_000, "KHR")!
    assert.equal(r.meets, true) // 48,000,000 / 4,012 = $11,964.11
    assert.equal(r.usd, 11964.11)
    assert.equal(r.zakatKhr, 1200000) // 48,000,000 × 2.5%
    assert.equal(nisabCheck(m, 30_000_000, "KHR")!.meets, false) // $7,477.57
  })
  it("never a guess: no Nisab without a gold price, no riel check without the NBC rate, nothing for a bad amount", () => {
    const noGold = islamicMarket({ ...market, local_gold: null, gold: null } as unknown as MarketLive, "2026-10-20")
    assert.equal(nisabCheck(noGold, 12000, "USD"), null)
    assert.equal(nisabCheck({ ...m, usdKhr: null }, 48_000_000, "KHR"), null)
    assert.equal(nisabCheck(m, Number.NaN, "USD"), null)
  })
  it("Jumādā al-Ūlā is «ជុម៉ាដាល់អូឡា» (Yerny's review), al-Ākhirah «ជុម៉ាដាល់អាឃីរ» — the old «ជូម៉ាដាល់» nowhere", async () => {
    assert.equal(HIJRI_MONTHS_KM[4], "ជុម៉ាដាល់អូឡា")
    assert.equal(HIJRI_MONTHS_KM[5], "ជុម៉ាដាល់អាឃីរ")
    const { readdirSync, statSync } = await import("node:fs")
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.(ts|tsx)$/.test(f) ? [join(d, f)] : []))
    for (const f of walk(join(process.cwd(), "src"))) if (!f.endsWith("market.test.ts")) assert.ok(!readFileSync(f, "utf8").includes("ជូម៉ាដាល់"), f)
  })
  it("the quick check sits on the Nisab card, [ $ | ៛ ] as the one-tap switch", () => {
    const card = read("src/components/islamic/islamic-market-card.tsx")
    assert.match(card, /<NisabQuickCheck m=\{m\} \/>/)
    assert.match(card, /nisabCheck\(m, amount, currency\)/)
    assert.match(card, /\{ value: "USD", label: "\$" \},\n\s+\{ value: "KHR", label: "៛" \}/)
  })
})

describe("Gold in the units Cambodia trades by (founder, 21/10/2026)", () => {
  it("grams → តម្លឹង / ជី / ហ៊ុន / លី to the nearest លី; 85 g is «២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី» (… ៦ ហ៊ុន alone = 84.75 g)", () => {
    assert.equal(GRAMS_PER_HUN, 0.375)
    assert.equal(GRAMS_PER_LI, 0.0375)
    assert.equal(khmerGoldWeight(85), "២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី")
    assert.equal(2 * 37.5 + 2 * 3.75 + 6 * 0.375 + 7 * 0.0375, 85.0125) // within half a លី of 85 g
    assert.equal(khmerGoldWeight(37.5), "១ តម្លឹង")
    assert.equal(khmerGoldWeight(3.75), "១ ជី")
    assert.equal(khmerGoldWeight(75), "២ តម្លឹង") // zero units left out
  })
  it("the price's reference names its real source — Phnom Penh kilo gold or the international spot — never mislabelled", () => {
    assert.match(goldReference("local"), /^តម្លៃយោងមាសគីឡូ ២៤K ផ្សារភ្នំពេញ · /)
    assert.match(goldReference("spot"), /^តម្លៃយោងមាសសុទ្ធ ២៤K អន្តរជាតិ · ទីផ្សារជាក់ស្តែងតាមហាងក្នុងស្រុកអាចមានគម្លាតខុសគ្នាបន្តិចបន្តួច$/)
    const spot = islamicMarket({ ...market, local_gold: { ...market.local_gold!, date: "2026-10-10" } }, "2026-10-20")
    assert.ok(islamicBulletinHtml(spot, { hijri: "x", gregorian: "y", appUrl: "z" })!.includes(`(${goldReference("spot")})`))
    assert.equal(goldUnitsLine({ perGram: 110, perChi: 412.5, perDamlung: 4125 }), "១ ជី ≈ $413 · ១ តម្លឹង ≈ $4,125 (១ ក្រាម ≈ $110.00)")
  })
  it("the hub card says the same: Cambodian units first, the reference, the Nisab in តម្លឹង", () => {
    const card = read("src/components/islamic/islamic-market-card.tsx")
    assert.match(card, /<p className="font-medium tabular-nums">\{goldUnitsLine\(m\.gold\)\}<\/p>/)
    assert.match(card, /\{goldReference\(m\.gold\.source\)\}/)
    assert.match(card, /មាស ៨៥ ក្រាម ≈ \{khmerGoldWeight\(NISAB_GOLD_GRAMS\)\}/)
  })
})
