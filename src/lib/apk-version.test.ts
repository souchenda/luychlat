import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { apkDownloadPath, apkFileName, apkVersion, appVersionInfo, installedApkCode, LATEST_APK, updateAvailable, updateSnoozed, UPDATE_SNOOZE_MS } from "./apk-version"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
// android/ and capacitor.config.ts are not in the Docker build context (.dockerignore): checked locally and before every APK build.
const native = !existsSync(join(root, "android")) && "android/ is not in the build context"

describe("The Android app's version and in-app update (founder, 22/10/2026 — Task #468)", () => {
  it("/api/app/version: the newest APK — v1.6, build 7 (Task #473), the versioned file, the Khmer changes", () => {
    assert.deepEqual(appVersionInfo(), {
      latestVersion: "1.6",
      versionCode: 7,
      downloadUrl: "/downloads/LuyChlat-v1.6.apk",
      changelogKhmer: "• SoundBox ប្រកាសទទួលប្រាក់ភ្លាមៗ ទោះបិទអេក្រង់\n• ប៊ូតុងអនុញ្ញាតប្រើថ្ម សម្រាប់ទូរសព្ទនៅតុគិតលុយ",
    })
    assert.deepEqual(apkVersion(7), { kind: "known", version: "1.6", code: 7 })
    assert.equal(updateAvailable(6, 7), true) // 1.5 is offered 1.6 — one tap (its DownloadListener)
    assert.equal(apkFileName("1.5"), "LuyChlat-v1.5.apk")
    assert.equal(apkDownloadPath("1.5"), "/downloads/LuyChlat-v1.5.apk")
    assert.match(read("src/app/api/app/version/route.ts"), /NextResponse\.json\(appVersionInfo\(\), \{ headers: \{ "Cache-Control": "no-store" \} \}\)/)
  })

  it("the installed build from the User-Agent; an APK before 1.5 (no token) is older; a browser has none", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36"
    assert.equal(installedApkCode(`${ua} LuyChlatApp/6`, true), 6)
    assert.equal(installedApkCode(ua, true), 0)
    assert.equal(installedApkCode(ua, false), null)
    assert.deepEqual([updateAvailable(0, 6), updateAvailable(5, 6), updateAvailable(6, 6), updateAvailable(7, 6), updateAvailable(null, 6)], [true, true, false, false, false])
    assert.deepEqual(apkVersion(6), { kind: "known", version: "1.5", code: 6 })
    assert.deepEqual(apkVersion(0), { kind: "old" })
    assert.deepEqual(apkVersion(null), { kind: "browser" })
  })

  it("«ពេលក្រោយ» snoozes this version for a day — never the next one", () => {
    const now = 1_800_000_000_000
    assert.equal(updateSnoozed(`6:${now - 3_600_000}`, 6, now), true)
    assert.equal(updateSnoozed(`6:${now - UPDATE_SNOOZE_MS - 1}`, 6, now), false)
    assert.equal(updateSnoozed(`6:${now}`, 7, now), false)
    assert.equal(updateSnoozed(null, 6, now), false)
    assert.equal(updateSnoozed("garbage", 6, now), false)
  })

  it("wired: the prompt in the app (Android only, the file checked first), the version in Settings › About", () => {
    const p = read("src/components/layout/app-update.tsx")
    assert.match(p, /if \(!isNativeApp\(\)\) return/)
    assert.match(p, /fetch\("\/api\/app\/version"/)
    assert.match(p, /fetch\(latest\.downloadUrl, \{ method: "HEAD"/)
    assert.match(p, /if \(\(installed \?\? 0\) >= IN_APP_DOWNLOAD_FROM\) \{\s*window\.location\.href = url/)
    assert.match(read("src/app/(app)/layout.tsx"), /<AppUpdatePrompt \/>/)
    assert.match(read("src/app/(app)/settings/page.tsx"), /<StatusBadge>\{apkLabel \?\? `v\$\{APP_VERSION\}`\}<\/StatusBadge>/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.ok(km.includes('"appUpdate.title": "🚀 មានកំណែថ្មី v{version}!"'))
    assert.ok(km.includes('"appUpdate.update": "អាប់ដេតឥឡូវនេះ (Update)"'))
    assert.ok(km.includes('"settings.apkVersion": "ជំនាន់ v{version} (Build {code})"'))
  })

  it("the build publishes /downloads/LuyChlat-v<version>.apk and keeps /LuyChlat.apk; Nginx serves only that file pattern", { skip: !existsSync(join(root, "deploy")) && "deploy/ is not in the build context" }, () => {
    const b = read("deploy/build-apk.sh")
    assert.match(b, /version=\$\(sed -n 's\/\^\[\[:space:\]\]\*versionName "\\\(\[0-9\.\]\*\\\)"\.\*\/\\1\/p'/)
    assert.match(b, /named="LuyChlat-v\$version\.apk"/)
    assert.match(b, /mv -f "\$OUT\/\$named\.new" "\$OUT\/\$named"/)
    assert.match(b, /mv -f "\$OUT\/LuyChlat\.apk\.new" "\$OUT\/LuyChlat\.apk"/)
    const n = read("deploy/nginx-setup.sh")
    assert.match(n, /location ~ \^\/downloads\/\(LuyChlat-v\[0-9\]\+\(\\\\\.\[0-9\]\+\)\*\\\\\.apk\)\$ \{/)
    assert.match(n, /grep -q "luychlat-versioned-apk" "\$site"/)
  })

  it("one version everywhere: build.gradle, the User-Agent token and LATEST_APK; download links leave the WebView", { skip: native }, () => {
    const gradle = read("android/app/build.gradle")
    assert.match(gradle, new RegExp(`versionCode ${LATEST_APK.code}\\b`))
    assert.match(gradle, new RegExp(`versionName "${LATEST_APK.version.replace(".", "\\.")}"`))
    assert.match(read("capacitor.config.ts"), new RegExp(`appendUserAgent: "LuyChlatApp/${LATEST_APK.code}"`))
    const main = read("android/app/src/main/java/com/luychlat/app/MainActivity.java")
    assert.match(main, /getBridge\(\)\.getWebView\(\)\.setDownloadListener\(/)
    assert.match(main, /new Intent\(Intent\.ACTION_VIEW, Uri\.parse\(url\)\)/)
  })
})

describe("No hard-coded «1.0.0» in Settings › About (founder, 22/10/2026 — Task #470)", () => {
  it("APP_VERSION is the newest APK's version; package.json follows it; the badge shows «ជំនាន់ v1.5 (Build 6)» in the app", () => {
    assert.match(read("src/lib/app-info.ts"), /export const APP_VERSION: string = LATEST_APK\.version/)
    assert.doesNotMatch(read("src/lib/app-info.ts"), /"1\.0\.0"/)
    assert.equal(JSON.parse(read("package.json")).version, `${LATEST_APK.version}.0`)
    assert.equal(apkVersion(LATEST_APK.code).kind, "known")
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.ok(km.includes('"settings.apkVersion": "ជំនាន់ v{version} (Build {code})"'))
    // The label fills the badge itself (it sat in the hint under «1.0.0» before).
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /if \(v\.kind === "known"\) setApkLabel\(v\.version \? t\("settings\.apkVersion", \{ version: v\.version, code: v\.code \}\)/)
    assert.doesNotMatch(settings, /hint=\{apkLabel/)
  })
})
