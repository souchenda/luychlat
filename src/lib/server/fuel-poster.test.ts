import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { cycleLine, fuelChange, fuelPosterContent, FUEL_POSTER_TITLE } from "@/lib/fuel-poster"
import { fuelCaption } from "@/lib/fuel-post"
import { postFooter } from "@/lib/post-footer"

import { fuelPoster } from "./fuel-poster"
import { newPricesText } from "./moc-fuel-sync"
import { posterAssetsReady } from "./poster-kit"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const notice36200 = { regular: 5050, super: null, diesel: 5550, from: "2026-10-21", to: "2026-11-01" }
const before = { regular: 5350, super: null, diesel: 5550 }

describe("fuel price poster (founder, 21/10/2026 — Task #428)", () => {
  it("the change badge: ចុះ when the price fell, ឡើង when it rose, មិនប្រែប្រួល when unchanged, nothing without the cycle before", () => {
    // The ▼ / ▲ are drawn by the poster (Task #429): the «▼» glyph is not in the brand fonts — an empty box on the server.
    assert.deepEqual(fuelChange(5050, 5350), { tone: "down", text: "ចុះ ៣០០ ៛" })
    assert.deepEqual(fuelChange(5650, 5550), { tone: "up", text: "ឡើង ១០០ ៛" })
    assert.deepEqual(fuelChange(5550, 5550), { tone: "same", text: "មិនប្រែប្រួល" })
    assert.equal(fuelChange(5550, null), null)
  })

  it("notice #36200 on the poster: the title, the cycle, EA92 ៥,០៥០ ▼ ៣០០ and diesel ៥,៥៥០ unchanged", () => {
    const p = fuelPosterContent(notice36200, before)
    assert.equal(p.pill, "តម្លៃប្រេងសាំង") // Task #432
    assert.equal(p.title, FUEL_POSTER_TITLE)
    assert.equal(p.cycle, "ចាប់ពីថ្ងៃទី ២១ តុលា ដល់ ០១ វិច្ឆិកា ២០២៦")
    assert.deepEqual(
      p.cards.map((c) => [c.label, c.code, c.price, c.unit, c.change?.text]),
      [
        ["សាំងធម្មតា", "EA92", "៥,០៥០", "៛ / លីត្រ", "ចុះ ៣០០ ៛"],
        ["ប្រេងម៉ាស៊ូត", "DIESEL", "៥,៥៥០", "៛ / លីត្រ", "មិនប្រែប្រួល"],
      ],
    )
  })

  it("brand rules: no parentheses and no «&» on the graphic, Khmer digits only, EA95 only when the notice lists it", () => {
    const p = fuelPosterContent({ ...notice36200, super: 5450 }, { ...before, super: 5450 })
    const all = [p.pill, p.title, p.cycle, p.source, ...p.cards.flatMap((c) => [c.label, c.price, c.unit, c.change?.text ?? ""])].join(" ")
    assert.doesNotMatch(all, /[()&]|[0-9]/)
    assert.deepEqual(p.cards.map((c) => c.code), ["EA92", "EA95", "DIESEL"])
    assert.equal(fuelPosterContent(notice36200, before).cards.length, 2)
    // A cycle across the year names both years.
    assert.equal(cycleLine("2026-12-21", "2027-01-01"), "ចាប់ពីថ្ងៃទី ២១ ធ្នូ ២០២៦ ដល់ ០១ មករា ២០២៧")
  })

  it("draws a 1080 × 1080 PNG", async () => {
    await posterAssetsReady
    const png = fuelPoster(fuelPosterContent(notice36200, before))
    assert.equal(png.subarray(1, 4).toString(), "PNG")
    assert.equal(png.readUInt32BE(16), 1080)
    assert.equal(png.readUInt32BE(20), 1080)
  })

  it("the caption (Task #429): the post, then the compact footer with «#តម្លៃប្រេង» — no «✨ ចុះឈ្មោះ… 👇👇», within 1,024 characters", () => {
    const words = newPricesText(notice36200, before, 36200)
    assert.doesNotMatch(words, /✨|ចុះឈ្មោះប្រើ|👇/)
    const caption = fuelCaption(words, "telegram")
    const footer = postFooter("community", "telegram", ["#តម្លៃប្រេង"])
    assert.ok(caption.endsWith(footer), "the footer is not dropped")
    assert.ok(caption.length <= 1024, `${caption.length}`)
    assert.match(caption, /៥,០៥០ ៛\/លីត្រ \(▼ ៣០០\)/)
    assert.match(footer, /📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖\n<a href="https:\/\/app\.luychlat\.com\/download">Android \(APK\)<\/a> · <a href="https:\/\/app\.luychlat\.com">iOS \/ Web<\/a> · <a href="https:\/\/t\.me\/luychlat_bot">Telegram Bot<\/a>\n\n👉 ចូលរួមសហគមន៍ ៖ @LuyChlatCommunity\n/)
    // Packed in short lines so no hashtag breaks on a phone (hashtagLines).
    assert.match(footer, /#LuyChlat #អេបលុយឆ្លាត\n#គ្រប់គ្រងហិរញ្ញវត្ថុ #តម្លៃប្រេង$/)
    // The Page: plain text, the handles as t.me links.
    assert.match(fuelCaption(words, "facebook"), /t\.me\/LuyChlatCommunity[\s\S]*#តម្លៃប្រេង$/)
  })

  it("wired: the card previews the poster, approval publishes the photo on the channel and the Page, the waiting card is re-sent", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /case "FUEL": \{[\s\S]*?png: f \? poster\(\(\) => fuelPoster\(f\)\) : null/)
    assert.match(sp, /if \(row\.kind === "FUEL"\) \{[\s\S]*?sendPosterPhoto\(chat, png, caption[\s\S]*?publishPhotoToFacebook\(approval, png, fbText\)/)
    assert.match(sp, /REPREVIEW_READY = \[[^\]]*"fuel-poster", "fuel-poster-v2"[^\]]*"poster-website"/)
    // The words come from the stored prices, so a waiting card shows the current caption.
    assert.match(sp, /const words = \(await fuelTextOf\(row\)\) \?\? String\(row\.payload\.telegram \?\? ""\)/)
    assert.match(read("supabase/migrations/20270244000000_repreview_fuel_poster_v2.sql"), /'repreview', 'fuel-poster-v2'[\s\S]*post_key = 'notice-36200' and status = 'PENDING'/)
    // The pill is its words alone (Task #432: the small drawn pump read as a «▯» box), the footer «app.luychlat.com».
    assert.match(read("src/lib/server/fuel-poster.ts"), /drawHeader\(ctx, \{ text: p\.pill, icon: null \}\)/)
    assert.match(read("src/lib/server/poster-kit.ts"), /export const POSTER_WEBSITE = "app\.luychlat\.com"/)
    assert.match(sp, /REPREVIEW_READY = \[[^\]]*"fuel-pill"/)
    assert.match(read("supabase/migrations/20270247000000_repreview_fuel_pill.sql"), /'repreview', 'fuel-pill'[\s\S]*post_key = 'notice-36200' and status = 'PENDING'/)
    // The badge's arrow is a drawn shape, never a glyph.
    const drawn = read("src/lib/server/fuel-poster.ts")
    assert.match(drawn, /ctx\.moveTo\(x0, ay - 8\)/)
    assert.doesNotMatch(drawn.replace(/\/\/.*$/gm, ""), /fillText\([^)]*[▼▲]/)
    assert.match(read("supabase/migrations/20270243000000_repreview_fuel_poster.sql"), /'repreview', 'fuel-poster'[\s\S]*post_key = 'notice-36200' and status = 'PENDING'/)
  })
})
