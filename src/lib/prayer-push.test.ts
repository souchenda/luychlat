import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { groupByMember, prayerPushPayload, type PrayerPushTarget } from "./prayer-push"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("The prayer-time Web Push — the phone rings with the app closed (founder, 20/10/2026)", () => {
  it("the notification: the in-app alert's tag (never doubled), it buzzes, stays on screen, opens the prayer page", () => {
    const p = prayerPushPayload({ prayer: "asr", title: "ដល់ម៉ោងសឡាត អាសារ ហើយ", body: "15:20 · ភ្នំពេញ" })
    assert.deepEqual(p, {
      title: "🕌 ដល់ម៉ោងសឡាត អាសារ ហើយ",
      body: "15:20 · ភ្នំពេញ",
      tag: "prayer-asr",
      url: "/islamic/prayer",
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 800],
    })
    // The app's own alert uses the same tag (components/islamic/prayer-alerts.tsx).
    assert.match(read("src/components/islamic/prayer-alerts.tsx"), /`prayer-\$\{key\}`/)
    // The service worker keeps it on screen.
    assert.match(read("public/sw.js"), /requireInteraction: Boolean\(data\.requireInteraction\)/)
  })
  it("one claim per member, day and prayer; all their phones rung in that pass", () => {
    const row = (user_id: string, endpoint: string): PrayerPushTarget => ({ user_id, endpoint, p256dh: "k", auth: "a", province: "phnom_penh", language: "km" })
    const g = groupByMember([row("u1", "e1"), row("u2", "e2"), row("u1", "e3")])
    assert.deepEqual([...g.keys()], ["u1", "u2"])
    assert.deepEqual(g.get("u1")!.map((r) => r.endpoint), ["e1", "e3"])
  })
  it("the dispatcher: Islamic Mode members' phones with prayer alerts on, every minute, logged with the real counts", () => {
    const d = read("src/lib/server/bot-dispatch.ts")
    assert.match(d, /await sendPrayerTimes\(\)\n    await sendPrayerPush\(\)/)
    assert.match(d, /bot_claim_prayer_push/)
    assert.match(d, /pushToPhones\(rows, payload, 10 \* 60\)/)
    assert.match(d, /Prayer push: \$\{phones\} phone\(s\) of \$\{members\} member\(s\)/)
    const sql = read("supabase/migrations/20270232000000_prayer_push.sql")
    assert.match(sql, /add column if not exists prayer_alerts boolean not null default true/)
    assert.match(sql, /join public\.islamic_settings s on s\.user_id = p\.user_id and s\.enabled\n    where p\.prayer_alerts;/)
    assert.match(sql, /primary key \(user_id, day, prayer\)/)
    assert.match(sql, /update public\.push_subscriptions set prayer_alerts = p_on where endpoint = p_endpoint and user_id = \(select auth\.uid\(\)\)/)
  })
  it("the app's prayer-alert switch turns the server push on or off for this phone", () => {
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /void setPrayerPush\(false\)/)
    assert.match(c, /if \(result === "granted"\) void enablePush\(\)\.then\(\(state\) => \(state === "on" \? setPrayerPush\(true\) : false\)\)/)
    assert.match(read("src/lib/push.ts"), /supabase\.rpc\("set_prayer_push", \{ p_endpoint: sub\.endpoint, p_on: on \}\)/)
  })
})

describe("Holiday notifications at 05:00; the festival wish keeps the religious separation (founder, 20/10/2026)", () => {
  it("the festival wish to members at 05:00; Pchum Ben and the Chinese festivals never to an Islamic Mode member", async () => {
    const h = read("src/lib/server/holy-days.ts")
    assert.match(h, /export const FESTIVAL_GREETING_HOUR = 5/)
    assert.match(h, /if \(now\.hour < FESTIVAL_GREETING_HOUR\) return/)
    assert.match(h, /p_buddhist: skipsIslamicMode\(festival\.key\)/)
    const { skipsIslamicMode } = await import("./server/holy-days")
    assert.equal(skipsIslamicMode("pchum_ben"), true)
    assert.equal(skipsIslamicMode("chinese_new_year"), true)
    assert.equal(skipsIslamicMode("mid_autumn"), true)
    assert.equal(skipsIslamicMode("water_festival"), false)
    assert.equal(skipsIslamicMode("new_year"), false)
  })
  it("Mid-Autumn is «ពិធីសែននំលោកខែ» everywhere — never «សែនព្រះខែ» (the Water Festival's «សំពះព្រះខែ»)", async () => {
    const { nationalDayByKey } = await import("./calendar/cambodia-holidays")
    assert.equal(nationalDayByKey("mid-autumn")!.title, "ពិធីសែននំលោកខែ")
    const { dictionaries } = await import("./i18n/dictionaries")
    assert.equal(dictionaries.km["cultural.mid_autumn.name"], "ពិធីសែននំលោកខែ")
    assert.equal(dictionaries.km["festival.mid_autumn.title"], "ថ្ងៃសែននំលោកខែ")
    for (const f of ["src/lib/calendar/cambodia-holidays.ts", "src/lib/i18n/dictionaries.ts"]) assert.doesNotMatch(read(f), /សែនព្រះខែ|នំព្រះខែ/, f)
  })
})
