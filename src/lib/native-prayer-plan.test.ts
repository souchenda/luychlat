import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { NATIVE_CHANNELS, NATIVE_DAYS_AHEAD, isNativePrayerId, nativePrayerId, nativePrayerPlan } from "./native-prayer-plan"
import { prayerTimes } from "./prayer"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const PP = { lat: 11.5564, lng: 104.9282 } // Phnom Penh

describe("The native Adhan's plan (founder, 20/10/2026)", () => {
  it("the week's prayers still ahead — today's past ones left out; each at its Cambodian minute", () => {
    const now = new Date("2026-10-20T06:00:00Z") // 13:00 in Cambodia: Fajr and Dhuhr have passed
    const plan = nativePrayerPlan(now, PP.lat, PP.lng)
    assert.deepEqual(plan.slice(0, 3).map((p) => p.prayer), ["asr", "maghrib", "isha"])
    assert.equal(plan.length, NATIVE_DAYS_AHEAD * 5 - 2)
    assert.ok(plan.every((p) => p.at.getTime() > now.getTime()))
    const asr = prayerTimes({ year: 2026, month: 10, day: 20 }, PP.lat, PP.lng).asr
    const local = plan[0].at.getTime() + 7 * 3_600_000
    assert.equal(new Date(local).getUTCHours() * 60 + new Date(local).getUTCMinutes(), Math.round(asr))
  })
  it("stable ids: the same prayer keeps its id across re-plans (never doubled), all ours, under 2^31", () => {
    const a = nativePrayerPlan(new Date("2026-10-20T00:00:00Z"), PP.lat, PP.lng).map((p) => p.id)
    const b = nativePrayerPlan(new Date("2026-10-20T06:00:00Z"), PP.lat, PP.lng).map((p) => p.id)
    assert.equal(new Set(a).size, a.length)
    assert.ok(b.every((id) => a.includes(id)))
    assert.equal(nativePrayerId({ year: 2026, month: 10, day: 29 }, "isha"), 202610294)
    assert.ok(a.every((id) => isNativePrayerId(id) && id < 2 ** 31))
    assert.equal(isNativePrayerId(12345), false)
  })
  // android/ is not in the Docker build context (.dockerignore): checked locally and before every APK build.
  it("the Android project: the Adhan in res/raw, the high-priority channel with its sound, exact alarms, the plugin built in", { skip: !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context" }, () => {
    assert.ok(existsSync(join(process.cwd(), "android/app/src/main/res/raw/adhan.mp3")))
    assert.ok(statSync(join(process.cwd(), "android/app/src/main/res/raw/adhan.mp3")).size > 100_000)
    assert.deepEqual(NATIVE_CHANNELS.adhan, { id: "prayer_adhan_v1", name: "Prayer Times Adhan", sound: "adhan.mp3", importance: 5 })
    assert.match(read("android/app/src/main/AndroidManifest.xml"), /<uses-permission android:name="android\.permission\.USE_EXACT_ALARM" \/>/)
    assert.match(read("android/app/capacitor.build.gradle"), /implementation project\(':capacitor-local-notifications'\)/)
    assert.match(read("android/app/build.gradle"), /versionCode 4\n\s+versionName "1\.3"/)
    // One brand name on the home screen: the APK and the PWA both «អេប លុយឆ្លាត» (founder, 20/10/2026 — two names confused).
    assert.match(read("android/app/src/main/res/values/strings.xml"), /<string name="app_name">អេប លុយឆ្លាត<\/string>/)
    assert.match(read("capacitor.config.ts"), /appName: "អេប លុយឆ្លាត"/)
    assert.match(read("src/app/manifest.ts"), /short_name: "អេប លុយឆ្លាត"/)
    if (existsSync(join(process.cwd(), "deploy/build-apk.sh"))) assert.match(read("deploy/build-apk.sh"), /"@capacitor\/local-notifications"/)
  })
  it("in the app: native alarms replace the in-page timer (never two Adhans); in a browser nothing changes", () => {
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /if \(!isNativeApp\(\)\) return/)
    assert.match(c, /\.then\(\(count\) => setNativeOn\(count > 0\)\)/)
    assert.match(c, /if \(!alertsOn \|\| nativeOn\) return/)
    assert.match(c, /const granted = await requestNativePrayerPermissions\(\)/)
    const n = read("src/lib/native-prayer.ts")
    assert.match(n, /if \(!isNativeApp\(\)\) return 0/)
    assert.match(n, /schedule: \{ at: p\.at, allowWhileIdle: true \}/)
    assert.match(n, /channelId: channel\.id/)
  })
})
