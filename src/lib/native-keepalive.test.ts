import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { KEEPALIVE_TEXT, keepAliveChange } from "./native-keepalive"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
// android/ is not in the Docker build context (.dockerignore): checked locally and before every APK build.
const native = !existsSync(join(root, "android")) && "android/ is not in the build context"

describe("The SoundBox with the screen locked — kept awake in the Android app (founder, 23/10/2026 — Task #473)", () => {
  it("the service runs while the page or the counter mode wants it: started once, stopped when the last one lets go", () => {
    let s: Set<string> = new Set()
    const step = (source: string, on: boolean) => {
      const r = keepAliveChange(s, source, on)
      s = r.sources
      return r.action
    }
    assert.equal(step("counter", true), "start")
    assert.equal(step("page", true), null) // already running
    assert.equal(step("counter", false), null) // the page still wants it
    assert.equal(step("page", false), "stop")
    assert.equal(step("page", false), null) // nothing to stop twice
  })

  it("its notification says what it is, in Khmer", () => {
    assert.deepEqual(KEEPALIVE_TEXT, { title: "លុយឆ្លាត SoundBox កំពុងដំណើរការ", body: "កំពុងរង់ចាំទទួលដំណឹងទូទាត់ប្រាក់..." })
  })

  it("wired: the counter mode and the SoundBox page start it; the amount is spoken with the screen locked once awake; the battery prompt", () => {
    const keeper = read("src/components/payments/counter-mode.tsx")
    assert.match(keeper, /keepSoundboxAwake\("counter", active\)\s+return \(\) => keepSoundboxAwake\("counter", false\)/)
    const page = read("src/app/(app)/soundbox/page.tsx")
    assert.match(page, /keepSoundboxAwake\("page", enabled\)\s+return \(\) => keepSoundboxAwake\("page", false\)/)
    assert.match(page, /\{enabled && <BatteryExemptionCard \/>\}/)
    assert.match(read("src/components/payments/payment-chime-listener.tsx"), /document\.visibilityState !== "visible" && !soundboxAwake\(\)/)
    assert.match(read("src/app/(app)/settings/page.tsx"), /<SoundTestRow \/>\s+<CounterBatteryRow \/>/)
    const card = read("src/components/payments/battery-exemption.tsx")
    assert.match(card, /if \(exempt !== false\) return null/) // hidden once allowed, in a browser and in older APKs
    // The keep-alive carries nothing of payments, balances or sign-in (the SoundBox isolation).
    assert.deepEqual(
      [...read("src/lib/native-keepalive.ts").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
      ["@capacitor/core", "@/lib/native-bridge"],
    )
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"soundbox.batteryTitle": "សូមអនុញ្ញាតឱ្យអេបប្រើថ្មដោយគ្មានការរឹតបន្តឹង"'))
  })

  it("the Android side: a «specialUse» foreground service with a partial wake lock, its permissions, the plugin registered first", { skip: native }, () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    for (const p of ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_SPECIAL_USE", "WAKE_LOCK", "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"])
      assert.match(manifest, new RegExp(`android\\.permission\\.${p}"`), p)
    assert.match(manifest, /android:name="\.SoundboxKeepAliveService"\s+android:exported="false"\s+android:foregroundServiceType="specialUse"/)
    const service = read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAliveService.java")
    assert.match(service, /startForeground\(NOTIFICATION_ID, notification, ServiceInfo\.FOREGROUND_SERVICE_TYPE_SPECIAL_USE\)/)
    assert.match(service, /newWakeLock\(PowerManager\.PARTIAL_WAKE_LOCK, "luychlat:soundbox"\)/)
    assert.match(service, /wakeLock\.release\(\)/)
    assert.match(service, /return START_STICKY/)
    const plugin = read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAlivePlugin.java")
    assert.match(plugin, /@CapacitorPlugin\(name = "SoundboxKeepAlive"\)/)
    assert.match(plugin, /Settings\.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/MainActivity.java"), /registerPlugin\(SoundboxKeepAlivePlugin\.class\);[\s\S]*?super\.onCreate\(savedInstanceState\)/)
    assert.ok(existsSync(join(root, "android/app/src/main/res/drawable/ic_stat_soundbox.xml")))
  })
})

describe("SoundBox silent on phones, fine on the PC (founder, 23/10/2026 — Task #482)", () => {
  it("the phone's quiet mode never holds a payment up: no answer in 200 ms → unknown, spoken as before", () => {
    const k = read("src/lib/native-keepalive.ts")
    assert.match(k, /return Promise\.race\(\[\s+KeepAlive\.ringerMode\(\)\.then\(/)
    assert.match(k, /new Promise<null>\(\(resolve\) => setTimeout\(\(\) => resolve\(null\), QUIET_ANSWER_MS\)\)/)
    assert.match(k, /export const QUIET_ANSWER_MS = 200/)
  })
  it("the APK's ring no longer waits on a hung plugin promise (the cause — Task #481), and every announcement is logged", () => {
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.doesNotMatch(l, /import\("@capacitor\/local-notifications"\)\.then/)
    assert.match(l, /return \(channelReady \?\?= n\s+\.createChannel\(/)
    assert.match(l, /announceLog\(e, \{ quietStatus: String\(mode\), audioUnlocked: String\(paymentAudioUnlocked\(\)\), result: isQuiet\(mode\) \? "skipped \(phone quiet\)" : "speaking" \}\)/)
    assert.match(l, /console\.error\(`\[SoundBox\] clip refused: \$\{a\.src\} — /)
    assert.match(read("src/app/(app)/soundbox/page.tsx"), /console\.info\(`\[SoundBox\] Announce: amount=\$\{added\.amount\} \$\{added\.currency\}, quietStatus=\$\{quiet\}/)
  })
})

describe("SoundBox on an iPhone, screen on (founder, 23/10/2026 — Task #483)", () => {
  it("the first tap anywhere unlocks one audio context (a 1-sample silent buffer); the chime and the clips play through it", () => {
    const a = read("src/lib/payment-audio.ts")
    assert.match(a, /const silent = ctx\.createBuffer\(1, 1, 22_050\)/)
    assert.match(a, /const events = \["touchend", "pointerdown", "keydown"\] as const/)
    assert.match(a, /if \(decoded\.some\(\(b\) => !b\)\) return false/) // a missing file: HTML audio as before
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /useEffect\(\(\) => unlockOnFirstTap\(\), \[\]\)/)
    assert.match(l, /void playThroughWebAudio\(\[PAYMENT_CHIME_URL\]\)\.then\(\(ok\) => \(ok \? next\(\) : html\(\)\)\)/)
    assert.match(l, /async function playClips\(urls: string\[\]\): Promise<void> \{\s+\/\/[^\n]*\n\s+if \(await playThroughWebAudio\(urls\)\) return/)
    assert.match(l, /a\.setAttribute\("playsinline", ""\)\s+a\.setAttribute\("webkit-playsinline", ""\)/)
    // The SoundBox page's own player stays its own (golden 6): the listener never imports it.
    assert.doesNotMatch(l, /soundbox-audio/)
  })
  it("the SoundBox page says plainly whether it is connected", () => {
    const pill = read("src/components/soundbox/live-pill.tsx")
    assert.match(pill, /t\(live \? "soundbox\.connected" : "soundbox\.disconnected"\)/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.ok(km.includes('"soundbox.connected": "បានភ្ជាប់ (Connected)"'))
    assert.ok(km.includes('"soundbox.disconnected": "មិនទាន់ភ្ជាប់ (Disconnected)"'))
  })
})
