import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nextHolyDay } from "@/lib/khmer-lunar"

import { allowedChannels, holidayRouteAllowed, nationalCaptionHtml, nationalDateLine, nationalDayByKey, nationalDaysToPreview, nationalPillText, nextNationalDay, PUBLISH_MINUTE, royalNumerals } from "./cambodia-holidays"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("the home pill: the nearest event wins (founder, 22/10/2026 — Task #455)", () => {
  it("22/10 tomorrow's national day before a festival 4 days off; on the day; then the festival; then the Coronation", () => {
    const pill = (d: string) => {
      const n = nextNationalDay(d)
      const holy = nextHolyDay(d)
      return n && n.daysAway <= (holy?.daysAway ?? Infinity) ? nationalPillText(n) : `holy ${holy?.iso} ${holy?.festival}`
    }
    assert.equal(nextHolyDay("2026-10-22")?.daysAway, 4) // ចេញព្រះវស្សា, 26/10
    assert.equal(pill("2026-10-22"), "ស្អែកនេះ ៖ ទិវាសន្តិភាពទីក្រុងប៉ារីស (23 តុលា)")
    assert.equal(pill("2026-10-23"), "ថ្ងៃនេះ ៖ ទិវាសន្តិភាពទីក្រុងប៉ារីស")
    assert.equal(pill("2026-10-24"), "holy 2026-10-26 chenhVassa") // 2 days, nearer than the Coronation's 5
    assert.equal(pill("2026-10-26"), "holy 2026-10-26 chenhVassa") // the festival on its own day
    assert.equal(pill("2026-10-27"), "ព្រះរាជពិធីគ្រងរាជ្យ (2ថ្ងៃ)")
    assert.equal(pill("2026-10-28"), "ស្អែកនេះ ៖ ព្រះរាជពិធីគ្រងរាជ្យ (29 តុលា)")
  })
  it("the Islamic, merit and Chinese days are never the national pill's (their own calendars)", () => {
    assert.equal(nextNationalDay("2026-10-22", 365)?.day.kind !== "islamic", true)
    for (let i = 0; i < 365; i += 3) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      const n = nextNationalDay(d)
      if (n) assert.ok(!["islamic", "merit", "chinese"].includes(n.day.kind), `${d} ${n.day.key}`)
    }
  })
  it("wired: the pill weighs the national day against the cultural and holy days, a tie to the national day; 0-9 on screen", () => {
    const pill = read("src/components/dashboard/lunar-pill.tsx")
    // Task #456: every event on the nearest date (lib/pill-events.ts — the nearest wins, ties take turns).
    assert.match(pill, /for \(const n of upcomingNationalDays\(today\)\) events\.push\(\{ id: `national:\$\{n\.day\.key\}`, daysAway: n\.daysAway, kind: "national"/)
    assert.match(pill, /return nearestEvents\(events\) as Item\[\]/)
    assert.doesNotMatch(nationalPillText(nextNationalDay("2026-10-22")!), /[០-៩]/)
  })
})

describe("23 October — the 35th anniversary of the Paris Peace Agreements (Task #455)", () => {
  const d = nationalDayByKey("paris-peace")!
  it("the headline, «២៣ តុលា ១៩៩១ – ២៣ តុលា ២០២៦ · ខួបលើកទី៣៥», a national day: Khmer numerals (palace protocol)", () => {
    assert.equal(d.title, "ទិវារំលឹកខួប នៃកិច្ចព្រមព្រៀងសន្តិភាពទីក្រុងប៉ារីស")
    assert.equal(nationalDateLine(d, "2026-10-23"), "២៣ តុលា ១៩៩១ – ២៣ តុលា ២០២៦ · ខួបលើកទី៣៥")
    assert.equal(royalNumerals(d), true)
    assert.match(nationalCaptionHtml(d, "2026-10-23"), /^🇰🇭 <b>ទិវារំលឹកខួប នៃកិច្ចព្រមព្រៀងសន្តិភាពទីក្រុងប៉ារីស<\/b>\n📅 ២៣ តុលា ១៩៩១/)
  })
  it("the community channel and the Page — never @LuyChlatIslamic; 05:00 on 23/10, its card in «LCA Approval» from 21/10 08:00", () => {
    assert.deepEqual([...allowedChannels(d)], ["community", "facebook"])
    assert.equal(holidayRouteAllowed(d, "islamic"), false)
    assert.equal(PUBLISH_MINUTE, 5 * 60)
    assert.ok(nationalDaysToPreview("2026-10-22", 9 * 60).some((x) => x.day.key === "paris-peace" && x.date === "2026-10-23")) // today: the card goes now
    assert.ok(!nationalDaysToPreview("2026-10-23", 5 * 60).some((x) => x.day.key === "paris-peace")) // from 05:00 on the day: published, not previewed
  })
  it("the poster renders (the national frame, text only — no portrait is set for it)", async () => {
    const { nationalDayPoster } = await import("@/lib/server/national-day-poster")
    const { png, truncated } = nationalDayPoster(d, "2026-10-23")
    assert.ok(png.length > 20_000)
    assert.deepEqual([png[0], png[1], png[2], png[3]], [0x89, 0x50, 0x4e, 0x47])
    assert.equal(truncated, false)
  })
})
