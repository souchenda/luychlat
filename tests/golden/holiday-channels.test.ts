// GOLDEN GUARD — strict religious separation (founder, 20/10/2026: «Must strictly separate Islamic followers from
// non-Islamic audiences … Zero tolerance for cross-contamination»). No Buddhist day, Chinese festival, ancestral offering
// or civic day ever reaches @LuyChlatIslamic; no Islamic day reaches the general channel or the Page. Never weaken this
// test to make a change pass — change it only on the founder's decision.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { allowedChannels, holidayCategory, holidayRouteAllowed, NATIONAL_DAYS, nationalChannel, nationalDayByKey } from "../../src/lib/calendar/cambodia-holidays"
import { channelFor, islamicCaptionHtml, islamicPostContent, ISLAMIC_KINDS } from "../../src/lib/islamic-channel"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("GOLDEN · strict religious separation of the channels", () => {
  it("every holiday definition: a non-Islamic day can never target @LuyChlatIslamic; an Islamic day only it", () => {
    for (const d of NATIONAL_DAYS) {
      const category = holidayCategory(d)
      if (category === "islamic") {
        assert.deepEqual([...allowedChannels(d)], ["islamic"], d.key)
        assert.equal(holidayRouteAllowed(d, "community"), false, d.key)
        assert.equal(holidayRouteAllowed(d, "facebook"), false, d.key)
      } else {
        assert.ok(!allowedChannels(d).includes("islamic"), `${d.key} (${category}) targets the Islamic channel`)
        assert.equal(holidayRouteAllowed(d, "islamic"), false, d.key)
        assert.equal(nationalChannel(d), "community", d.key)
      }
    }
  })
  it("the Buddhist days and the Chinese festivals are categorised as such — and forbidden on the Islamic channel", () => {
    for (const k of ["visak-bochea", "pchum-ben"]) assert.equal(holidayCategory(nationalDayByKey(k)!), "buddhist", k)
    for (const k of ["chinese-new-year", "qingming", "hungry-ghost", "mid-autumn"]) assert.equal(holidayCategory(nationalDayByKey(k)!), "chinese", k)
    for (const k of ["eid-al-fitr", "eid-al-adha", "arafah", "islamic-new-year", "mawlid"]) assert.equal(holidayCategory(nationalDayByKey(k)!), "islamic", k)
    for (const k of ["coronation", "independence"]) assert.equal(holidayCategory(nationalDayByKey(k)!), "civic", k)
  })
  it("the dispatcher refuses a route the calendar does not allow — before anything is sent", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    const national = sp.slice(sp.indexOf('if (row.kind === "NATIONAL_DAY") {\n      // The commemoration poster'))
    const guard = national.indexOf('if (!holidayRouteAllowed(d, islamic ? "islamic" : "community")) {')
    assert.ok(guard > 0, "the guard is in the national-day publisher")
    assert.ok(guard < national.indexOf("sendPosterPhoto(chat"), "the guard runs before the send")
    assert.ok(national.includes('if (holidayRouteAllowed(d, "facebook") && facebookConfig()'), "the Page only when allowed")
  })
  it("the other holiday posts stay off the Islamic channel: Sil days, festival posters, holiday notes", () => {
    for (const kind of ["HOLYDAY", "POSTER", "HOLIDAY", "NATIONAL_DAY", "MORNING", "EVENING", "DILEMMA", "SPOTLIGHT"]) assert.equal(channelFor(kind), "community", kind)
  })
  it("the Islamic channel's own posts never speak of a Buddhist day, a Chinese festival or an ancestral offering", () => {
    const banned = /ថ្ងៃសីល|ភ្ជុំបិណ្ឌ|វិសាខបូជា|ចូលឆ្នាំចិន|ឆេងម៉េង|សែនក្បាលទឹក|សែនព្រះខែ|សែនព្រេន|ព្រះពុទ្ធ|វត្ត/
    for (const kind of ISLAMIC_KINDS)
      for (let i = 0; i < 366; i += 7) {
        const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
        const html = islamicCaptionHtml(islamicPostContent(kind, day, { day: (i % 29) + 1, month: (i % 12) + 1, year: 1448 }))
        assert.doesNotMatch(html, banned, `${kind} ${day}`)
      }
    for (const d of NATIONAL_DAYS.filter((x) => holidayCategory(x) === "islamic")) assert.doesNotMatch(`${d.title} ${d.message}`, banned, d.key)
  })
})
