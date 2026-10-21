import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { channelPosts, cleanNoticePrices, isFuelNotice, parseNoticePeriod, pricesAgree } from "./moc-fuel"

// The Ministry of Commerce's post on t.me/s/mocnewsfeed (the period is in the text, the prices on the stamped image).
const POST_TEXT = "សេចក្តីជូនដំណឹង៖ ស្តីពីថ្លៃលក់រាយប្រេងឥន្ធនៈនៅតាមស្ថានីយសម្រាប់ការអនុវត្ត ចាប់ពីវេលាម៉ោង ១ រសៀលថ្ងៃទី១១ ខែតុលា រហូតដល់ថ្ងៃទី២១ ខែតុលា ឆ្នាំ២០២៦"

const PAGE = `
<div class="tgme_widget_message" data-post="mocnewsfeed/35600"><div class="tgme_widget_message_text js-message_text">ព័ត៌មានផ្សេង</div><time datetime="2026-10-09T03:00:00+00:00"></time></div>
<div class="tgme_widget_message" data-post="mocnewsfeed/35619">
  <a class="tgme_widget_message_photo_wrap" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/notice.jpg')"></a>
  <div class="tgme_widget_message_text js-message_text">${POST_TEXT.replace("ថ្ងៃទី១១", "ថ្ងៃទី&nbsp;១១")}<br/>#MoC</div>
  <time datetime="2026-10-11T05:02:00+00:00"></time>
</div>`

describe("MoC fuel notice", () => {
  it("finds the notice post, its image and its period (Khmer digits)", () => {
    const posts = channelPosts(PAGE, "mocnewsfeed")
    assert.equal(posts.length, 2)
    const notice = posts.find((p) => isFuelNotice(p.text))
    assert.equal(notice?.id, 35619)
    assert.equal(notice?.image, "https://cdn4.telesco.pe/file/notice.jpg")
    assert.deepEqual(parseNoticePeriod(notice!.text), { from: "2026-10-11", to: "2026-10-21" })
  })
  it("periods: the 1st, 11th and 21st cycles, across a month and a year", () => {
    assert.deepEqual(parseNoticePeriod("ចាប់ពីថ្ងៃទី១ រហូតដល់ថ្ងៃទី១១ ខែតុលា ឆ្នាំ២០២៦"), { from: "2026-10-01", to: "2026-10-11" })
    assert.deepEqual(parseNoticePeriod("ថ្ងៃទី២១ រហូតដល់ថ្ងៃទី១ ខែវិច្ឆិកា ឆ្នាំ២០២៦"), { from: "2026-10-21", to: "2026-11-01" })
    assert.deepEqual(parseNoticePeriod("ថ្ងៃទី២១ ខែធ្នូ រហូតដល់ថ្ងៃទី១ ខែមករា ឆ្នាំ២០២៧"), { from: "2026-12-21", to: "2027-01-01" })
    assert.equal(parseNoticePeriod("ថ្ងៃទី៣១ រហូតដល់ថ្ងៃទី១ ខែមីនា ឆ្នាំ២០២៧"), null) // no 31 February
  })
  it("prices: EA92, EA95 when listed, diesel — riel per litre, whole 50s", () => {
    assert.deepEqual(cleanNoticePrices({ regular: "៥ ១៥០", super: 5450, diesel: "5,650", regular_usd: 1.27, diesel_usd: 1.39, from: "2026-10-11", to: "2026-10-21" }), {
      regular: 5150,
      super: 5450,
      diesel: 5650,
      regularUsd: 1.27,
      dieselUsd: 1.39,
      from: "2026-10-11",
      to: "2026-10-21",
    })
    // The usual notice has no EA95; a "super" no dearer than EA92 is a misread column.
    assert.equal(cleanNoticePrices({ regular: 5150, diesel: 5650 })?.super, null)
    assert.equal(cleanNoticePrices({ regular: 5150, super: 5150, diesel: 5650 })?.super, null)
    // Not a notice, or an implausible figure.
    assert.equal(cleanNoticePrices({ is_fuel_notice: false, regular: 5150, diesel: 5650 }), null)
    assert.equal(cleanNoticePrices({ regular: 5155, diesel: 5650 }), null)
    assert.equal(cleanNoticePrices({ regular: 515, diesel: 5650 }), null)
  })
  it("riel must agree with the dollar row at the NBC rate (a misread digit fails)", () => {
    const p = cleanNoticePrices({ regular: 5150, diesel: 5650, regular_usd: 1.27, diesel_usd: 1.39 })!
    assert.equal(pricesAgree(p, 4062), true)
    assert.equal(pricesAgree({ ...p, diesel: 5050 }, 4062), false)
    assert.equal(pricesAgree({ ...p, dieselUsd: null }, 4062), false)
  })
})

describe("The notice's period in every wording (founder, 21/10/2026)", () => {
  it("regression: notice #36200 said «ដល់», not «រហូតដល់» — the period went unread and the fuel was missing", () => {
    const n36200 = "សេចក្តីជូនដំណឹង៖ ស្តីពីថ្លៃលក់រាយប្រេងឥន្ធនៈនៅតាមស្ថានីយសម្រាប់ការអនុវត្តចាប់ពីវេលាម៉ោង ១ រសៀលថ្ងៃទី២១ ខែតុលា ដល់ថ្ងៃទី១ ខែវិច្ឆិកា ឆ្នាំ២០២៦"
    assert.ok(isFuelNotice(n36200))
    assert.deepEqual(parseNoticePeriod(n36200), { from: "2026-10-21", to: "2026-11-01" })
  })
  it("«ដល់» with the last day bare, and the old «រហូតដល់» still read", () => {
    assert.deepEqual(parseNoticePeriod("ថ្ងៃទី២១ ដល់ ៣១ ខែតុលា ឆ្នាំ២០២៦"), { from: "2026-10-21", to: "2026-10-31" })
    assert.deepEqual(parseNoticePeriod("ថ្ងៃទី១១ ខែតុលា រហូតដល់ថ្ងៃទី២១ ខែតុលា ឆ្នាំ២០២៦"), { from: "2026-10-11", to: "2026-10-21" })
    assert.equal(parseNoticePeriod("ថ្ងៃទី២១ ខែតុលា ឆ្នាំ២០២៦"), null) // no end: never guessed
  })
})

describe("An admin sends the MoC notice to the bot (founder, 21/10/2026)", () => {
  it("read as the notice when forwarded from @mocnewsfeed or captioned «/setfuel» / «ក្រសួងពាណិជ្ជកម្ម» — a fuel receipt («ប្រេង») stays a slip", async () => {
    const { isFuelNoticePhoto } = await import("@/lib/server/moc-fuel-sync")
    assert.equal(isFuelNoticePhoto({ forwardedFrom: "mocnewsfeed" }), true)
    assert.equal(isFuelNoticePhoto({ forwardedFrom: "MocNewsFeed" }), true)
    assert.equal(isFuelNoticePhoto({ caption: "/setfuel" }), true)
    assert.equal(isFuelNoticePhoto({ caption: "សេចក្តីជូនដំណឹង ក្រសួងពាណិជ្ជកម្ម" }), true)
    for (const c of ["ចាក់ប្រេង 20000", "ប្រេង", "fuel 5$", ""]) assert.equal(isFuelNoticePhoto({ caption: c }), false, c)
    assert.equal(isFuelNoticePhoto({ forwardedFrom: "someotherchannel" }), false)
  })
  it("admins only, before the slip reader; the reply proposes /setfuel and never applies the prices itself", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const hook = readFileSync(join(process.cwd(), "src/app/api/telegram/webhook/route.ts"), "utf8").replace(/\r\n/g, "\n")
    const at = hook.indexOf("isFuelNoticePhoto({ caption: message.caption")
    assert.ok(at > 0 && at < hook.indexOf("handlePrivatePhoto(chatId, slipPhoto"), "before the slip reader")
    assert.match(hook, /&& \(await isAdminChat\(message\.chat\.id\)\)\) \{\n\s+const chatId = message\.chat\.id\n\s+after\(\(\) => handleFuelNoticePhoto\(chatId, slipPhoto, message\.caption\)\)/)
    const sync = readFileSync(join(process.cwd(), "src/lib/server/moc-fuel-sync.ts"), "utf8")
    const fn = sync.slice(sync.indexOf("export async function handleFuelNoticePhoto"), sync.indexOf("export function isFuelNoticePhoto"))
    assert.doesNotMatch(fn, /setFuelPrices\(|scheduleFuelPost\(/) // a proposal only — the admin's /setfuel applies it
    assert.match(fn, /បើត្រឹមត្រូវ៖ \/setfuel/)
    assert.match(fn, /pricesAgree\(p, usdKhr\)/)
  })
})
