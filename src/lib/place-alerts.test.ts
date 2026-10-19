import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isPlaceReviewCallback, mapsUrl, parsePlaceReviewCallback, placeAlertButtons, placeAlertText, placeDecisionLine, type PendingPlace } from "./place-alerts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const kampot: PendingPlace = { id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", kind: "SURAU", name: "Surau", province: "កំពត", address: null, lat: 10.59313, lng: 104.16669, note: null, submitter: "Sokha" }

describe("A member's place suggestion reaches «LCA Approval» at once (founder, 19/10/2026)", () => {
  it("the alert: name, kind, province / address, who suggested it — with ✅ / ❌ and Google Maps", () => {
    const text = placeAlertText(kampot)
    assert.equal(
      text,
      ["🔔 សំណើបន្ថែមទីតាំងថ្មី (New Place Submission):", "📍 ឈ្មោះ៖ Surau", "🏷️ ប្រភេទ៖ ស៊ូរ៉ាវ (Surau)", "🗺️ ខេត្ត/អាសយដ្ឋាន៖ កំពត", "👤 អ្នកស្នើសុំ៖ Sokha"].join("\n"),
    )
    const buttons = placeAlertButtons(kampot)
    assert.deepEqual(buttons[0].map((b) => b.text), ["✅ អនុម័ត (Approve)", "❌ បដិសេធ (Reject)"])
    assert.deepEqual(buttons[1], [{ text: "🗺️ មើលលើ Google Maps", url: "https://www.google.com/maps?q=10.59313,104.16669" }])
    for (const b of buttons[0]) assert.ok("callback_data" in b && Buffer.byteLength(b.callback_data) <= 64)
    assert.equal(placeAlertButtons({ ...kampot, lat: null, lng: null }).length, 1) // no map without a location
    assert.equal(mapsUrl(null, 104), null)
  })

  it("the taps parse exactly; the decision replaces the buttons", () => {
    assert.deepEqual(parsePlaceReviewCallback(`plr:a:${kampot.id}`), { approve: true, id: kampot.id })
    assert.deepEqual(parsePlaceReviewCallback(`plr:r:${kampot.id}`), { approve: false, id: kampot.id })
    assert.equal(parsePlaceReviewCallback("plr:a:nope"), null)
    assert.ok(isPlaceReviewCallback("plr:x") && !isPlaceReviewCallback("pl:a"))
    assert.match(placeDecisionLine("approved"), /^✅ បានអនុម័តរួចរាល់ដោយ Founder — ទីតាំងនេះបានបង្ហាញជាសាធារណៈលើផែនទីហើយ!$/)
    assert.match(placeDecisionLine("rejected"), /^❌ បានបដិសេធ/)
  })

  it("sent every minute to the approval room, once; only a super admin's tap decides, audited; already-listed places never alert", () => {
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await flushPlaceSubmissions\(\)/)
    const server = read("src/lib/server/place-alerts.ts")
    assert.match(server, /const chats = await marketingChats\(\)/) // the approval group first (lib/server/admin-routes)
    assert.match(server, /if \(!sent\) await botDb\(\)\.rpc\("bot_place_unclaim"/) // claimed once; handed back only if undelivered
    assert.match(read("supabase/migrations/20270186000000_contributor_thanks_activity.sql"), /update public\.islamic_places p set notified = true\s+where p\.id in \(select q\.id from public\.islamic_places q where not q\.approved and not q\.notified order by q\.created_at limit 10 for update skip locked\)/)
    // At once: the app calls the notify route right after a member's insert.
    assert.match(read("src/lib/places.ts"), /if \(!input\.approved\) void fetch\("\/api\/islamic\/places\/notify", \{ method: "POST" \}\)/)
    assert.match(read("src/app/api/islamic/places/notify/route.ts"), /after\(\(\) => flushPlaceSubmissions\(\)\)/)
    assert.match(server, /if \(status === "approved"\) await thankContributor\("place", parsed\.id\)/)
    const sql = read("supabase/migrations/20270185000000_place_submission_alerts.sql")
    assert.match(sql, /update public\.islamic_places set notified = true where approved and not notified;/) // the pending Kampot surau still goes out
    assert.match(sql, /where not p\.approved and not p\.notified/)
    assert.match(sql, /actor := public\.tip_chat_super_admin\(p_actor\);\s*if actor is null then raise exception 'super admin only'/)
    assert.match(sql, /perform public\.audit\('place_approve'/)
    assert.match(sql, /perform public\.audit\('place_reject'/)
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /isPlaceReviewCallback\(update\.callback_query\.data\)\) \{\s*await handlePlaceReviewCallback/)
  })

  it("qasidah submissions already alert the approval room with ✅ / ❌ (lib/server/nasheed-review.ts)", () => {
    const n = read("src/lib/server/nasheed-review.ts")
    assert.match(n, /for \(const chat of await marketingChats\(\)\)/)
    assert.match(read("src/app/api/nasheed/submit/route.ts"), /await notifySubmission\(id\)/)
  })
})
