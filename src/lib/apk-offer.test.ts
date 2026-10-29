import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { APK_OFFER_SNOOZE_DAYS, APK_URL, isAndroidUa, shouldOfferApk } from "./apk-offer"

const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1"
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
const now = Date.parse("2026-10-20T12:00:00Z")
const base = { ua: ANDROID, native: false, alertsOn: true, snoozedAt: null, now }

describe("The Android app offer on the prayer page (founder, 20/10/2026)", () => {
  it("Android Chrome with prayer alerts on — never inside the app, never on an iPhone or a computer, never with alerts off", () => {
    assert.equal(shouldOfferApk(base), true)
    assert.equal(shouldOfferApk({ ...base, native: true }), false)
    assert.equal(shouldOfferApk({ ...base, ua: IPHONE }), false)
    assert.equal(shouldOfferApk({ ...base, ua: DESKTOP }), false)
    assert.equal(shouldOfferApk({ ...base, alertsOn: false }), false)
    assert.equal(isAndroidUa(ANDROID), true)
    assert.equal(isAndroidUa(IPHONE), false)
  })
  it("«ពេលក្រោយ» hides it for 7 days on this phone", () => {
    assert.equal(APK_OFFER_SNOOZE_DAYS, 7)
    assert.equal(shouldOfferApk({ ...base, snoozedAt: now - 6 * 86_400_000 }), false)
    assert.equal(shouldOfferApk({ ...base, snoozedAt: now - 7 * 86_400_000 }), true)
  })
  it("the card: the founder's words, [ទាញយក APK] → /LuyChlat.apk, on the prayer page above the alert settings", async () => {
    assert.equal(APK_URL, "/LuyChlat.apk")
    const { dictionaries } = await import("./i18n/dictionaries")
    assert.equal(dictionaries.km["apkOffer.title"], "ដំឡើងអេប លុយឆ្លាត សម្រាប់ Android ដើម្បីឮអាហ្សានពេលចាក់សោអេក្រង់")
    assert.equal(dictionaries.km["apkOffer.download"], "ទាញយក APK")
    assert.equal(dictionaries.km["apkOffer.later"], "ពេលក្រោយ")
    // The founder's father (28/10/2026): the APK installed, yet the old Samsung Internet icon kept opening the browser
    // (no Adhan with the screen locked) — the card says to remove it and open only the new icon.
    assert.match(dictionaries.km["apkOffer.note"], /លុបរូបតំណាងចាស់.*browser.*App Luy Chlat/)
    assert.match(dictionaries.en["apkOffer.note"], /remove the old icon.*browser.*App Luy Chlat/)
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/prayer/page.tsx"), "utf8")
    assert.ok(page.indexOf("<ApkOffer />") > 0 && page.indexOf("<ApkOffer />") < page.indexOf("<PrayerAlertSettings />"))
    const card = readFileSync(join(process.cwd(), "src/components/islamic/apk-offer.tsx"), "utf8")
    assert.match(card, /shouldOfferApk\(\{ ua: navigator\.userAgent, native: isNativeApp\(\), alertsOn, snoozedAt: readSnooze\(\), now: Date\.now\(\) \}\)/)
  })
})
