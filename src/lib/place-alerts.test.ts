import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isPlaceReviewCallback, mapsUrl, parsePlaceReviewCallback, placeAlertButtons, placeAlertText, placeDecisionLine, type PendingPlace } from "./place-alerts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const kampot: PendingPlace = { id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", kind: "SURAU", name: "Surau", province: "កំពត", address: null, lat: 10.59313, lng: 104.16669, note: null, submitter: "Sokha" }

describe("A member's place suggestion reaches «LCA Approval» at once (founder, 19/10/2026)", () => {
  it("the card (founder, 20/10/2026): name, kind, province, the Google Maps link, who suggested it — with ✅ / ❌", () => {
    const text = placeAlertText({ ...kampot, contact: "+85512345678" })
    assert.equal(
      text,
      [
        "📍 <b>សំណើបញ្ចូលទីតាំងថ្មី</b>",
        "• <b>ឈ្មោះ៖</b> Surau",
        "• <b>ប្រភេទ៖</b> 🤲 ស៊ូរ៉ាវ (Surau)",
        "• <b>ខេត្ត/រាជធានី៖</b> កំពត",
        '• <b>តំណភ្ជាប់ផែនទី៖</b> <a href="https://www.google.com/maps?q=10.59313,104.16669">មើលលើ Google Maps</a>',
        "• <b>អ្នកស្នើសុំ៖</b> 👤 Sokha (+85512345678)",
        "",
        "សូមពិនិត្យរូបភាពខាងលើ និងចុចសម្រេចចិត្ត៖",
      ].join("\n"),
    )
    const buttons = placeAlertButtons(kampot)
    assert.deepEqual(buttons, [[{ text: "✅ អនុម័ត", callback_data: `plr:a:${kampot.id}` }, { text: "❌ បដិសេធ", callback_data: `plr:r:${kampot.id}` }]])
    for (const b of buttons[0]) assert.ok(Buffer.byteLength(b.callback_data) <= 64)
    assert.equal(mapsUrl(null, 104), null)
    assert.match(placeAlertText({ ...kampot, lat: null, lng: null }), /តំណភ្ជាប់ផែនទី៖<\/b> —/) // no map without a location
  })

  it("HTML-safe, fits a photo caption, and says so when there is no photo", async () => {
    const { placeAlertTextNoPhoto } = await import("./place-alerts")
    const long = placeAlertText({ ...kampot, name: "<b>x</b> & y".padEnd(400, "ក"), address: "ក".repeat(400), note: "ខ".repeat(400) })
    assert.ok(long.includes("&lt;b&gt;x&lt;/b&gt; &amp; y"))
    assert.ok(long.length + 20 <= 1024, `caption ${long.length}`) // + the community badge line
    assert.match(placeAlertTextNoPhoto(kampot), /គ្មានរូបថតភ្ជាប់មកទេ — សូមពិនិត្យព័ត៌មានខាងលើ និងចុចសម្រេចចិត្ត៖$/)
  })

  it("with a photo: sendPhoto with the card as its caption; without (or if it fails): the text card; ✅ / ❌ edit the caption", () => {
    const server = read("src/lib/server/place-alerts.ts")
    assert.match(server, /const photo = await placePhoto\(p\.photo_path\)/)
    assert.match(server, /fetch\(`https:\/\/api\.telegram\.org\/bot\$\{token\}\/sendPhoto`/)
    assert.match(server, /if \(!res\?\.ok\)\s+res = await tg\("sendMessage", \{ chat_id: chat, text: `\$\{communityBadge\(p\.islamic\)\}\\n\$\{placeAlertTextNoPhoto\(p\)\}`, parse_mode: "HTML"/)
    assert.match(server, /isPhoto\s+\? await deps\.tg\("editMessageCaption"/)
    const sql = read("supabase/migrations/20270199000000_place_photo_cards.sql")
    assert.match(sql, /submitter text, islamic boolean, photo_path text, contact text\)/)
  })

  it("the form: a photo up to 5 MB (any image), previewed, replaceable and removable; uploaded before the suggestion", async () => {
    const { placePhotoError, PLACE_PHOTO_MAX_BYTES } = await import("./place-photo")
    assert.equal(PLACE_PHOTO_MAX_BYTES, 5 * 1024 * 1024)
    assert.equal(placePhotoError({ type: "image/heic", size: 4_000_000 }), null)
    assert.equal(placePhotoError({ type: "image/jpeg", size: PLACE_PHOTO_MAX_BYTES + 1 }), "suggest.photoTooBig")
    assert.equal(placePhotoError({ type: "application/pdf", size: 10 }), "suggest.photoNotImage")
    const sheet = read("src/components/islamic/suggest-place-sheet.tsx")
    assert.match(sheet, /accept="image\/\*"/)
    assert.match(sheet, /photoPath = await uploadPlacePhoto\(photo, userId\)/)
    assert.match(sheet, /photo_path: photoPath/)
    assert.match(sheet, /data-testid="suggest-photo-preview"/)
    const page = read("src/app/(app)/islamic/places/page.tsx")
    assert.match(page, /<PlacePhoto path=\{p\.photo_path\} kind=\{p\.kind\} compact=\{compact\} \/>/)
    assert.match(page, /data-testid="place-banner"/) // the open card's fallback without a photo
  })

  it("the taps parse exactly; the decision replaces the buttons", () => {
    assert.deepEqual(parsePlaceReviewCallback(`plr:a:${kampot.id}`), { approve: true, id: kampot.id })
    assert.deepEqual(parsePlaceReviewCallback(`plr:r:${kampot.id}`), { approve: false, id: kampot.id })
    assert.equal(parsePlaceReviewCallback("plr:a:nope"), null)
    assert.ok(isPlaceReviewCallback("plr:x") && !isPlaceReviewCallback("pl:a"))
    assert.equal(placeDecisionLine("approved", { name: "Surau", province: "កំពត" }), "✅ បានអនុម័តជោគជ័យ — ទីតាំង Surau (កំពត) ត្រូវបានដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈលើផែនទីហើយ!")
    assert.equal(placeDecisionLine("approved"), "✅ បានអនុម័តជោគជ័យ — ទីតាំងនេះ ត្រូវបានដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈលើផែនទីហើយ!")
    assert.match(placeDecisionLine("rejected", { name: "X" }), /^❌ បានបដិសេធ — ទីតាំង X ត្រូវបានដកចេញ/)
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
    assert.match(server, /r\.status === "approved" \? await thankContributor\("place", parsed\.id, r\.name \?\? "", deps\)/)
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
