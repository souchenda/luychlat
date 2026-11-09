import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { cambodiaIso, fingerprintOf, fingerprintText, noticePayload, readNotice } from "./bank-notices"

const notice = (title: string, text: string) => ({ pkg: "com.example.acleda", title, text, time: Date.UTC(2026, 10, 9, 3, 15, 0) })

describe("Bank app notifications on the phone (founder, 9/11/2026)", () => {
  it("reads a notice with the bot's own reader; the title helps when the text alone is not enough", () => {
    const r = readNotice(notice("ACLEDA", "You have received USD 50.00 from SOK SAN to A/C ***6222 on 05/10/2026 10:15. Ref: 123456789."))
    assert.equal(r?.alert.amount, 50)
    assert.equal(r?.alert.direction, "IN")
    assert.equal(r?.alert.suffix, "6222")
    const t = readNotice(notice("Received payment", "USD 12.50 to A/C ***6222 via KHQR"))
    assert.equal(t?.alert.amount, 12.5)
  })

  it("a PM time is the afternoon (regression: PPCBank «08/11/2026 05:38 PM», 8/11/2026)", () => {
    const at = (s: string) => readNotice(notice("PPCBank", `You have received USD 1.00 from SOK SAN to A/C ***7387 on ${s}. Ref: 123456789.`))?.alert.postedAt
    assert.equal(at("08/11/2026 05:38 PM"), "2026-11-08T17:38:00+07:00")
    assert.equal(at("08/11/2026 12:05 AM"), "2026-11-08T00:05:00+07:00")
    assert.equal(at("08/11/2026 12:05 PM"), "2026-11-08T12:05:00+07:00")
    assert.equal(at("08/11/2026 17:38"), "2026-11-08T17:38:00+07:00")
    assert.equal(at("08/11/2026"), "2026-11-08T12:00:00+07:00")
  })

  it("an unreadable or non-money notice is never recorded", () => {
    assert.equal(readNotice(notice("ABA", "Your OTP is 123456")), null)
    assert.equal(readNotice(notice("Promo", "Get 10% cashback this weekend!")), null)
  })

  it("the fingerprint matches the bot's (the same notice forwarded to the bot is not booked twice)", async () => {
    const raw = "You have received USD 50.00 from SOK SAN to A/C ***6222.  Ref: 1."
    const bot = createHash("sha256").update(raw.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex").slice(0, 40)
    assert.equal(await fingerprintOf(raw), bot)
    assert.equal(fingerprintText("  A  b "), "a b")
  })

  it("no date in the notice → the moment the phone received it, Cambodia time", async () => {
    assert.equal(cambodiaIso(Date.UTC(2026, 10, 9, 17, 30, 5)), "2026-11-10T00:30:05+07:00")
    const p = await noticePayload(notice("ACLEDA", "KHQR payment received USD 25.50 to A/C ***6222 from Customer via Bakong. Trace: 98765432."))
    assert.equal(p?.posted_at, "2026-11-09T10:15:00+07:00")
    assert.equal(p?.kind, "KHQR")
  })

  it("the database never guesses the wallet and never books twice", () => {
    const sql = readFileSync("supabase/migrations/20270306000000_app_bank_notice.sql", "utf8")
    assert.match(sql, /return jsonb_build_object\('status', 'no_wallet'/)
    assert.match(sql, /return jsonb_build_object\('status', 'ambiguous'/)
    assert.match(sql, /x\.goal_target is null/) // never a savings goal
    assert.match(sql, /\(x\.visibility <> 'PERSONAL' or x\.owner_id = uid\)\s+and public\.can_write_workspace\(x\.workspace_id\)/)
    assert.match(sql, /interval '15 minutes'/) // the same money already there (AUTOBOK, the bot, typed)
    assert.match(sql, /values \(uid, fp, null\) on conflict do nothing/) // a skipped duplicate can never be undone into the other record
    assert.match(sql, /grant execute on function public\.app_bank_alert\(jsonb\) to authenticated;/)
    assert.doesNotMatch(sql, /to anon/)
  })

  // android/ is not in the Docker build context (memory: docker-test-context): checked locally and before every push.
  it("the phone keeps only bank apps' money notices, and only the person turns it on", { skip: !existsSync("android/app/src/main/AndroidManifest.xml") && "android/ is not in the build context" }, () => {
    const java = readFileSync("android/app/src/main/java/com/luychlat/app/BankNoticeListener.java", "utf8")
    assert.match(java, /!BANK_APP\.matcher\(pkg\)\.find\(\)\) return;/)
    assert.match(java, /!MONEY\.matcher\(title \+ " " \+ text\)\.find\(\)\) return;/)
    assert.doesNotMatch(java, /HttpURLConnection|OkHttp|URL\(/) // nothing leaves the phone from here
    const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8")
    assert.match(manifest, /android:name="\.BankNoticeListener"[\s\S]*?android:permission="android\.permission\.BIND_NOTIFICATION_LISTENER_SERVICE"/)
  })
})
