import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { HijriDate } from "./islamic"
import { channelFor, communityLink, ISLAMIC_COMMUNITY_URL, ISLAMIC_KINDS, islamicDailyHtml, jumuahHtml, sunnahFastHtml, sunnahFastTomorrow } from "./islamic-channel"
import { plannedIslamicPosts, plannedPosts, previewText, targetLabel, type PostKind } from "./scheduled-posts"

const h = (day: number, month: number, year = 1448): HijriDate => ({ day, month, year }) as HijriDate
const plain: (d: string) => HijriDate | null = () => h(15, 4)
const GENERAL: PostKind[] = ["MORNING", "HOLIDAY", "FUEL", "EVENING", "SPOTLIGHT", "BULLETIN", "RATES", "POSTER", "HOLYDAY"]
// 2026-10-18 is a Sunday, 2026-10-21 a Wednesday, 2026-10-23 a Friday.

describe("Islamic channel — kept 100 % apart from the general channel (founder, 18/10/2026)", () => {
  it("a Buddhist holy-day note (and every general post) goes to the general channel only", () => {
    for (const k of GENERAL) assert.equal(channelFor(k), "community", k)
    for (const k of ISLAMIC_KINDS) assert.equal(channelFor(k), "islamic", k)
  })
  it("no Islamic post ever speaks of ថ្ងៃសីល or the Buddhist calendar; no italics", () => {
    const posts = [
      islamicDailyHtml("2026-10-18", h(6, 5)),
      sunnahFastHtml("2026-10-18", h(7, 5)),
      sunnahFastHtml("2026-10-21", h(10, 5)),
      jumuahHtml("2026-10-23", h(12, 5)),
    ]
    for (const p of posts) {
      assert.doesNotMatch(p, /សីល|ពុទ្ធ|វិសាខ|Buddh|uposatha/i)
      assert.doesNotMatch(p, /<i>/)
      assert.match(p, /📖 ប្រភព៖ <a href="https:\/\/(quran\.com|sunnah\.com)\//)
    }
  })
  it("posts: the Hijri date and a lesson daily at 08:00, the sunnah fast on Sunday / Wednesday 19:00, Jumu'ah Friday 11:30", () => {
    const kinds = (day: string, minutes: number) => plannedIslamicPosts(day, minutes, plain).map((p) => p.kind)
    assert.ok(kinds("2026-10-18", 7 * 60 + 15).includes("ISLAMIC_DAILY"))
    assert.ok(kinds("2026-10-18", 18 * 60 + 15).includes("ISLAMIC_FAST")) // Sunday → Monday's fast
    assert.ok(kinds("2026-10-21", 18 * 60 + 15).includes("ISLAMIC_FAST")) // Wednesday → Thursday's
    assert.ok(!kinds("2026-10-20", 18 * 60 + 15).includes("ISLAMIC_FAST")) // Tuesday
    assert.ok(kinds("2026-10-23", 11 * 60).includes("ISLAMIC_JUMUAH"))
    assert.ok(!kinds("2026-10-22", 11 * 60).includes("ISLAMIC_JUMUAH"))
    // Never in the general channel's plan.
    for (const p of plannedPosts("2026-10-23", 11 * 60)) assert.equal(channelFor(p.kind), "community")
  })
  it("no sunnah-fast reminder for a day in Ramadan, Eid al-Fitr, or Eid al-Adha and the Tashreeq days", () => {
    assert.equal(sunnahFastTomorrow(h(3, 9)), false)
    assert.equal(sunnahFastTomorrow(h(1, 10)), false)
    for (const d of [10, 11, 12, 13]) assert.equal(sunnahFastTomorrow(h(d, 12)), false)
    assert.equal(sunnahFastTomorrow(h(9, 12)), true) // the day of Arafah: a recommended fast
    assert.equal(sunnahFastTomorrow(null), false)
    const ramadan = () => h(3, 9)
    assert.ok(!plannedIslamicPosts("2026-10-18", 18 * 60 + 15, ramadan).some((p) => p.kind === "ISLAMIC_FAST"))
    assert.ok(!plannedIslamicPosts("2026-10-18", 21 * 60 + 30, plain).some((p) => p.kind === "ISLAMIC_FAST")) // more than 90 min late: never
  })
  it("the founder's preview names the Islamic channel as the only destination, with the approval buttons' gate", () => {
    const where = targetLabel({ telegram: true, facebook: false, channel: "islamic" })
    assert.equal(where, "✈️ Telegram Channel ឥស្លាម (@LuyChlatIslamic) តែប៉ុណ្ណោះ")
    const text = previewText({ kind: "ISLAMIC_JUMUAH", targets: { telegram: true, facebook: false, channel: "islamic" }, publishAt: "2026-10-23T02:00:00Z", body: "…", status: "PENDING" })
    assert.match(text, /📢 គោលដៅផ្សាយ៖ \[ ✈️ Telegram Channel ឥស្លាម \(@LuyChlatIslamic\) តែប៉ុណ្ណោះ \]/)
    assert.match(text, /🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម/)
  })
})

describe("In-app community link follows Islamic Mode", () => {
  it("ON → t.me/LuyChlatIslamic «សហគមន៍ អេប លុយឆ្លាត ឥស្លាម»; OFF → the configured general community", () => {
    assert.deepEqual(communityLink(true, "https://t.me/LuyChlatCommunity"), { url: ISLAMIC_COMMUNITY_URL, label: "support.communityIslamic", hint: "support.communityIslamicHint" })
    assert.equal(ISLAMIC_COMMUNITY_URL, "https://t.me/LuyChlatIslamic")
    assert.deepEqual(communityLink(false, "https://t.me/LuyChlatCommunity"), { url: "https://t.me/LuyChlatCommunity", label: "support.community", hint: "support.communityHint" })
    assert.equal(communityLink(false, null), null)
  })
  it("the support page uses it (never in a business workspace)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(app)/support/page.tsx"), "utf8")
    assert.match(page, /communityLink\(islamic && workspace\?\.type !== "BUSINESS", c\?\.community_url\)/)
    const dict = readFileSync(join(process.cwd(), "src/lib/i18n/dictionaries.ts"), "utf8")
    assert.match(dict, /"support\.communityIslamic": "សហគមន៍ អេប លុយឆ្លាត ឥស្លាម"/)
  })
})

describe("/islamicpreview — today's Islamic previews now (admins only, still ✅ / 🚀 / ❌)", () => {
  it("is an admin command that only schedules (previews); nothing is published without a tap", () => {
    const hook = readFileSync(join(process.cwd(), "src/app/api/telegram/webhook/route.ts"), "utf8")
    assert.ok(hook.includes("/^\\/islamicpreview(@\\w+)?$/i.test(command) && (await isAdminChat(chatId))"))
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    const fn = sp.slice(sp.indexOf("export async function previewIslamicNow"), sp.indexOf("/** A fuel price change"))
    assert.match(fn, /real\(\)\.schedulePost\(/)
    assert.doesNotMatch(fn, /islamicChannel\(|publishTaken|\.publish\(|sendMessage/)
    assert.match(fn, /\(at\) => minutes < at/) // only posts still ahead today
  })
})

