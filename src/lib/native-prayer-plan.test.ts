import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { LATEST_APK } from "./apk-version"
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
    // At least 1.11 (an Adhan rings only if still in this phone's plan — 24/10/2026, Task #494); the exact version is
    // LATEST_APK's (apk-version.test.ts), so a later release never breaks this test.
    assert.ok(LATEST_APK.code >= 12)
    assert.match(read("android/app/build.gradle"), new RegExp(`versionCode ${LATEST_APK.code}\\n\\s+versionName "${LATEST_APK.version.replace(".", "\\.")}"`))
    // One brand name on the home screen: the APK and the PWA both «អេប លុយឆ្លាត» (founder, 20/10/2026 — two names confused).
    assert.match(read("android/app/src/main/res/values/strings.xml"), /<string name="app_name">អេប លុយឆ្លាត<\/string>/)
    assert.match(read("capacitor.config.ts"), /appName: "អេប លុយឆ្លាត"/)
    assert.match(read("src/app/manifest.ts"), /short_name: "អេប លុយឆ្លាត"/)
    if (existsSync(join(process.cwd(), "deploy/build-apk.sh"))) assert.match(read("deploy/build-apk.sh"), /"@capacitor\/local-notifications"/)
  })
  it("in the app: native alarms replace the in-page timer (never two Adhans); in a browser nothing changes", () => {
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /if \(!isNativeApp\(\)\) return/)
    assert.match(c, /\.then\(\(count\) => \{\s*setNativeOn\(count > 0\)/) // and the status shown (Task #472)
    assert.match(c, /if \(!active \|\| nativeOn\) return/) // the gate: switch AND Islamic Mode (Task #525)
    assert.match(c, /const granted = await withTimeout\(requestNativePrayerPermissions\(\), 20_000\)/) // after the switch is on (Task #467)
    const n = read("src/lib/native-prayer.ts")
    assert.match(n, /if \(!isNativeApp\(\)\) return 0/)
    assert.match(n, /schedule: \{ at: p\.at, allowWhileIdle: true \}/)
    assert.match(n, /channelId: channel\.id/)
  })
})

describe("The Adhan with the screen off — Android alarms really set (founder, 22/10/2026 — Tasks #471 / #472)", () => {
  it("the switch's permission arrives after it flips on: the alarms are planned again then, and when the app comes back", () => {
    const c = read("src/components/islamic/prayer-alerts.tsx")
    // The bug: the first plan ran before the permission, found none, planned nothing — the in-page timer, frozen with
    // the screen off, rang only at unlock.
    assert.match(c, /const granted = await withTimeout\(requestNativePrayerPermissions\(\), 20_000\)[^\n]*\n[^\n]*\n\s+useNativePrayerStatus\.getState\(\)\.replan\(\)/)
    assert.match(c, /\}, \[gate, alertSound, location\.lat, location\.lng, location\.label, t, tick\]\)/)
    assert.match(c, /document\.addEventListener\("visibilitychange", onShow\)/)
    assert.match(c, /useNativePrayerStatus\.getState\(\)\.set\(\{ planned: count, permission: count > 0 \? "granted" : "missing" \}\)/)
    // Never silently «on»: the card says how many prayers are set, or that the permission is missing.
    assert.match(c, /\{alertsOn && native && <NativeAlarmStatus sound=\{alertSound\} \/>\}/)
    assert.match(c, /permission === "missing"\s+\? t\("prayerAlert\.nativeMissing"\)\s+: planned\s+\? t\("prayerAlert\.nativePlanned", \{ count: planned \}\)/)
  })
  it("⏰ the one-minute test is a real exact alarm on the Adhan channel, with an id a re-plan never cancels", () => {
    const n = read("src/lib/native-prayer.ts")
    assert.match(n, /export const NATIVE_TEST_ID = 199_999_999/)
    assert.equal(isNativePrayerId(199_999_999), false)
    assert.match(n, /const at = Date\.now\(\) \+ \(o\.inMs \?\? NATIVE_TEST_DELAY_MS\)/)
    assert.match(n, /id: NATIVE_TEST_ID,[\s\S]*?channelId: channel\.id,[\s\S]*?schedule: \{ at: new Date\(at\), allowWhileIdle: true \}/) // 1.5: the plugin
    assert.match(n, /export const NATIVE_TEST_DELAY_MS = 10_000/) // 10 s (Task #473): lock the phone and listen
    assert.match(n, /if \(\(await step\("permission", n\.checkPermissions\(\)\)\)\.display !== "granted"\) return 0/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.ok(km.includes('"prayerAlert.nativeTest": "តេស្តសំឡេងអាហ្សានពេលចាក់សោរ (10 វិនាទី)"'))
    assert.ok(km.includes('"prayerAlert.nativeTestSet": "បានកំណត់ម៉ោងរោទ៍តេស្ត 10 វិនាទី! សូមចាក់សោរអេក្រង់ទូរស័ព្ទឥឡូវនេះ។"')) // bang's words (Task #480)
    // The instant preview stays beside it: play / stop, no lock needed.
    assert.match(read("src/components/islamic/prayer-alerts.tsx"), /onClick=\{testAdhan\} aria-pressed=\{testing\}/)
  })
})

describe("The 10 s lock-screen test that never rang on 1.5 — the Adhan as a real alarm clock from 1.6 (founder, 23/10/2026 — Task #474)", () => {
  it("1.6+: AlarmManager.setAlarmClock for every prayer and the test; 1.5 keeps the plugin; never both (never two Adhans)", () => {
    const n = read("src/lib/native-prayer.ts")
    assert.match(n, /const clock = await step\("schedule", AdhanAlarm\.schedule\(\{ alarms: plan\.map\(\(p\) => \(\{ id: p\.id, at: p\.at\.getTime\(\), channelId: channel\.id/)
    assert.match(n, /if \(clock\) return clock\.scheduled\s+await n\.schedule\(\{/) // the plugin only when the alarm clock is missing
    assert.match(n, /const added = await step\("test alarm", AdhanAlarm\.add\(\{ id: NATIVE_TEST_ID, at, title: o\.title, body: o\.body, channelId: channel\.id \}\)\)/)
    assert.match(n, /if \(added\) return "scheduled"/)
    assert.match(n, /await AdhanAlarm\.cancelAll\(\)\.catch\(\(\) => null\) \/\/ the alarm clock/)
  })
  it("the card says when Android refuses exact alarms («Alarms & reminders») and opens that switch; the battery card beside it", () => {
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /void nativeAlarmHealth\(\)\.then\(\(h\) => setExact\(h\.exact\)\)/)
    assert.match(c, /\{exact === false && \(/)
    assert.match(c, /onClick=\{\(\) => void openExactAlarmSettings\(\)\}/)
    assert.match(c, /<BatteryExemptionCard \/>\s+<Button type="button" variant="outline" className="h-10 w-full gap-2 rounded-xl" onClick=\{\(\) => void test\(\)\}/)
    // 1.5 too: the local-notifications plugin's own exact-alarm check and switch.
    const n = read("src/lib/native-prayer.ts")
    assert.match(n, /n\.checkExactNotificationSetting\(\)\.then\(\(e\) => e\.exact_alarm === "granted"/)
    assert.match(n, /await n\.changeExactNotificationSetting\(\)\.catch/)
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"prayerAlert.exactAllow": "បើក «ម៉ោងរោទ៍ និងការរំលឹក»"'))
  })
  it("the Android side: setAlarmClock when exact alarms are allowed, the notification on the Adhan channel, set again after a reboot", { skip: !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context" }, () => {
    const plugin = read("android/app/src/main/java/com/luychlat/app/AdhanAlarmPlugin.java")
    assert.match(plugin, /@CapacitorPlugin\(name = "AdhanAlarm"\)/)
    assert.match(plugin, /alarms\.setAlarmClock\(new AlarmManager\.AlarmClockInfo\(at, show\), fire\)/)
    assert.match(plugin, /alarms\.canScheduleExactAlarms\(\)/)
    assert.match(plugin, /Settings\.ACTION_REQUEST_SCHEDULE_EXACT_ALARM/)
    const receiver = read("android/app/src/main/java/com/luychlat/app/AdhanAlarmReceiver.java")
    assert.match(receiver, /static final String ADHAN_CHANNEL = "prayer_adhan_v1"/)
    assert.match(receiver, /if \(channelId == null \|\| channelId\.isEmpty\(\)\) channelId = ADHAN_CHANNEL/)
    // Task #475: with the Adhan chosen and the phone on normal, the player; the notification only as the fallback.
    assert.match(receiver, /if \(ADHAN_CHANNEL\.equals\(channelId\)\) \{[\s\S]*?ContextCompat\.startForegroundService\(context, play\);\s+return;/)
    const player = read("android/app/src/main/java/com/luychlat/app/AdhanPlayerService.java")
    // Task #476: the NOTIFICATION stream at the phone's own volume — never the alarm stream, never forced louder.
    assert.match(player, /\.setUsage\(AudioAttributes\.USAGE_NOTIFICATION\)/)
    assert.doesNotMatch(player, /USAGE_ALARM|setVolume\(|setStreamVolume/)
    assert.match(player, /player\.setDataSource\(this, Uri\.parse\("android\.resource:\/\/" \+ getPackageName\(\) \+ "\/" \+ R\.raw\.adhan\)\)/)
    assert.match(player, /newWakeLock\(PowerManager\.PARTIAL_WAKE_LOCK, "luychlat:adhan"\)/)
    assert.match(player, /channel\.setSound\(null, null\); \/\/ the player is the sound/) // never twice
    assert.match(player, /\.addAction\(0, "🔇 បិទសំឡេង", stopTap\)/)
    assert.match(player, /setOnCompletionListener\(\(mp\) -> stopSelf\(\)\)/)
    assert.match(player, /if \(wakeLock != null && wakeLock\.isHeld\(\)\) wakeLock\.release\(\)/)
    assert.ok(statSync(join(process.cwd(), "android/app/src/main/res/raw/adhan.mp3")).size > 100_000) // the bundled recording
    const mf = read("android/app/src/main/AndroidManifest.xml")
    assert.match(mf, /android:name="\.AdhanPlayerService"\s+android:exported="false"\s+android:foregroundServiceType="mediaPlayback"/)
    assert.match(mf, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK/)
    assert.match(receiver, /setCategory\(NotificationCompat\.CATEGORY_REMINDER\)/) // not ALARM: DND lets alarms through (Task #476)
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    assert.match(manifest, /<receiver android:name="\.AdhanAlarmReceiver" android:exported="false" \/>/)
    assert.match(manifest, /<action android:name="android\.intent\.action\.BOOT_COMPLETED" \/>\s+<action android:name="android\.intent\.action\.MY_PACKAGE_REPLACED" \/>/)
    assert.match(manifest, /android\.permission\.USE_EXACT_ALARM/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/MainActivity.java"), /registerPlugin\(AdhanAlarmPlugin\.class\);/)
    assert.ok(existsSync(join(process.cwd(), "android/app/src/main/res/drawable/ic_stat_prayer.xml")))
  })
})

describe("The phone's Silent / Vibrate / Do Not Disturb, always respected (founder, 23/10/2026 — Task #476)", () => {
  it("prayers: «រំញ័រ» beside Adhan / chime / silent; a quiet channel for it before 1.6; the safety note on the card", () => {
    assert.deepEqual(Object.keys(NATIVE_CHANNELS), ["adhan", "chime", "vibrate", "silent"])
    assert.equal(NATIVE_CHANNELS.vibrate.id, "prayer_vibrate_v1")
    assert.ok(NATIVE_CHANNELS.vibrate.importance < 3 && !NATIVE_CHANNELS.vibrate.sound) // never a sound of its own
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /\{ value: "vibrate", label: t\("prayerAlert\.vibrate"\) \}/)
    assert.match(c, /if \(alertSound === "vibrate"\) navigator\.vibrate\?\.\(/)
    assert.match(c, /\{t\("prayerAlert\.respectsPhone"\)\}/)
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"prayerAlert.respectsPhone": "អេបគោរពតាមស្ថានភាព Silent/រំញ័រ របស់ទូរស័ព្ទជានិច្ច"'))
  })
  it("the SoundBox: never spoken with the phone on Silent / Vibrate / DND (the app-wide voice and the SoundBox page)", () => {
    assert.match(read("src/components/payments/payment-chime-listener.tsx"), /void phoneQuiet\(\)\.then\(\(mode\) => \{\s+announceLog\([^\n]*\n\s+if \(!isQuiet\(mode\)\) speakNow\(e\)/)
    assert.match(read("src/app/(app)/soundbox/page.tsx"), /if \(isQuiet\(quiet\)\) return report\(\[document\.visibilityState, `phone:\$\{quiet\}`\]\)/)
    assert.match(read("src/lib/native-keepalive.ts"), /export const isQuiet = \(mode: "normal" \| "vibrate" \| "silent" \| null\) => mode === "silent" \|\| mode === "vibrate"/)
  })
  it("the Android side: Silent or DND → a silent notification; Vibrate → a vibration; the player only on normal, checked twice", { skip: !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context" }, () => {
    const q = read("android/app/src/main/java/com/luychlat/app/PhoneQuiet.java")
    assert.match(q, /getCurrentInterruptionFilter\(\) != NotificationManager\.INTERRUPTION_FILTER_ALL/) // DND = silent
    assert.match(q, /case AudioManager\.RINGER_MODE_SILENT:\s+return "silent";\s+case AudioManager\.RINGER_MODE_VIBRATE:\s+return "vibrate";/)
    const r = read("android/app/src/main/java/com/luychlat/app/AdhanAlarmReceiver.java")
    assert.match(r, /boolean silent = "silent"\.equals\(phone\) \|\| SILENT_CHANNEL\.equals\(channelId\);/)
    assert.match(r, /if \(silent \|\| vibrate\) \{\s+if \(vibrate\) PhoneQuiet\.vibrate\(context\);\s+notify\(context, id, QUIET_CHANNEL, title, body\);\s+return;/)
    assert.match(r, /channel\.setSound\(null, null\);\s+channel\.enableVibration\(false\);/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/AdhanPlayerService.java"), /if \(!"normal"\.equals\(PhoneQuiet\.mode\(this\)\)\) \{\s+stopSelf\(\);/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAlivePlugin.java"), /result\.put\("mode", PhoneQuiet\.mode\(getContext\(\)\)\)/)
    assert.match(read("android/app/src/main/AndroidManifest.xml"), /android\.permission\.VIBRATE/)
  })
})

describe("The lock-screen test that never answered on 1.7 — never a silent «កំពុងកំណត់…» (founder, 23/10/2026 — Tasks #479 / #480)", () => {
  it("a native step that never answers fails after its limit, with its name — so the card and the log say which", async () => {
    const { step } = await import("./native-prayer")
    await assert.rejects(step("channels", new Promise(() => {}), 30), /channels: no answer from Android/)
    assert.equal(await step("fast", Promise.resolve(7), 30), 7)
  })
  it("«custom» with no phone file plays (and shows) the default recording — never nothing", async () => {
    const { resolvePreset, availablePresets, CUSTOM_ADHAN } = await import("./adhan-presets")
    assert.equal(resolvePreset(CUSTOM_ADHAN, false)?.id, availablePresets()[0].id)
    assert.equal(resolvePreset(CUSTOM_ADHAN, true), undefined) // with a file: the phone's file
  })
  it("wired: every step time-limited, a failed plan shown and reported, the test's tap answered at once, its error on screen", () => {
    const n = read("src/lib/native-prayer.ts")
    for (const s of ['step("permission", n.checkPermissions())', 'step("cancel", cancelNativePrayers())', 'step("schedule", AdhanAlarm.schedule(', 'step("test alarm", AdhanAlarm.add(', 'step("channels", (async () => {'])
      assert.ok(n.includes(s), s)
    assert.match(n, /\}\)\(\)\)\.catch\(\(e\) => \{\s+channelsReady = null\s+throw e/) // a failure is never cached
    assert.match(n, /body: JSON\.stringify\(\{ source: "native-alarm", message: `\$\{where\} · build \$\{build\} · \$\{errorText\(e\)\}` \}\)/)
    const c = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(c, /useNativePrayerStatus\.getState\(\)\.set\(\{ planned: 0, permission: "error", error: errorText\(e\) \}\)\s+reportNativeAlarmError\("plan", e\)/)
    assert.match(c, /const pending = toast\.loading\(t\("prayerAlert\.nativeTestSetting"\)\)/)
    assert.match(c, /toast\.error\(t\("prayerAlert\.nativeTestFailed", \{ reason: errorText\(e\) \}\), \{ id: pending, duration: Infinity, closeButton: true \}\)/)
    assert.match(read("src/app/api/client-error/route.ts"), /"native-alarm"/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.ok(km.includes('"prayerAlert.nativeTestSet": "បានកំណត់ម៉ោងរោទ៍តេស្ត 10 វិនាទី! សូមចាក់សោរអេក្រង់ទូរស័ព្ទឥឡូវនេះ។"'))
  })
})

describe("«plugin: no answer from Android» — a Capacitor plugin never goes through a promise (founder, 23/10/2026 — Task #481)", () => {
  it("the bug, reproduced: a promise resolved with an object that answers every property hangs; used directly it works", async () => {
    // Capacitor's plugin object answers `then` with a native-call wrapper that never calls back.
    const unimplemented = (prop: PropertyKey) => () => {
      const p = Promise.reject(new Error(`${String(prop)} not implemented`))
      p.catch(() => null) // as Capacitor's: a promise of its own, the callbacks never called
      return p
    }
    const proxy = new Proxy({}, { get: (_, prop) => (prop === "ping" ? () => Promise.resolve("pong") : unimplemented(prop)) }) as { ping(): Promise<string> }
    const { step } = await import("./native-prayer")
    await assert.rejects(step("plugin", Promise.resolve().then(() => proxy), 50), /plugin: no answer from Android/)
    assert.equal(await proxy.ping(), "pong")
  })
  it("no file imports a Capacitor plugin through a promise, awaits it, or returns it from a promise", () => {
    const files = ["src/lib/native-prayer.ts", "src/components/payments/payment-chime-listener.tsx", "src/lib/native-keepalive.ts", "src/lib/native-updater.ts"]
    for (const f of files) {
      const s = read(f)
      assert.doesNotMatch(s, /import\("@capacitor\/[^"]+"\)\.then\(\(m\) => m\.[A-Z]/, f)
      assert.doesNotMatch(s, /await (plugin\(\)|LocalNotifications|AdhanAlarm|KeepAlive|AppUpdater)\b(?!\.)/, f)
      assert.doesNotMatch(s, /=> (LocalNotifications|AdhanAlarm|KeepAlive|AppUpdater)\s*$/m, f)
    }
    assert.match(read("src/lib/native-prayer.ts"), /import \{ LocalNotifications \} from "@capacitor\/local-notifications"[\s\S]*const n = LocalNotifications/)
    assert.match(read("src/components/payments/payment-chime-listener.tsx"), /import \{ LocalNotifications \} from "@capacitor\/local-notifications"[\s\S]*const n = LocalNotifications/)
  })
})

describe("A 1,710,000 ៛ sale announced 4 min late, at unlock (founder, 24/10/2026 — Task #486)", () => {
  it("the WebView's renderer stays «important» when the app is not visible — Android no longer freezes the page", { skip: !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context" }, () => {
    const m = read("android/app/src/main/java/com/luychlat/app/MainActivity.java")
    assert.match(m, /getBridge\(\)\.getWebView\(\)\.setRendererPriorityPolicy\(WebView\.RENDERER_PRIORITY_IMPORTANT, false\)/)
    assert.match(m, /if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O\) \{/)
  })
  it("the amount was never the problem: 1,710,000 ៛ is «received 1 lean 7 saen 1 meun riel», every clip there", async () => {
    const { khmerClipSequence, KHMER_CLIPS } = await import("./soundbox")
    const seq = khmerClipSequence(1_710_000, "KHR")
    assert.deepEqual(seq, ["received", "1", "lean", "7", "saen", "1", "meun", "riel"])
    assert.ok(seq.every((c) => (KHMER_CLIPS as readonly string[]).includes(c)))
    assert.deepEqual(khmerClipSequence(10_000_000, "KHR"), ["received", "10", "lean", "riel"])
  })
})
