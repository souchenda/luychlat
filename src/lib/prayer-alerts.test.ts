import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isStopAdhanMessage, playAdhan, playPreset, prayerNotificationOptions, primeAdhanAudio, silentWav, STOP_ADHAN_ACTION, STOP_ADHAN_MESSAGE, stopSound } from "./prayer-alerts"

class FakeAudio {
  src: string
  currentTime = 0
  paused = true
  onended: (() => void) | null = null
  constructor(src: string) {
    this.src = src
  }
  async play() {
    this.paused = false
    this.currentTime = 42
  }
  pause() {
    this.paused = true
  }
}

describe("🔇 Stop Adhan — one tap, at once (founder, 18/10/2026)", () => {
  it("stopSound pauses the Adhan and resets it to 0", async () => {
    const made: FakeAudio[] = []
    const g = globalThis as unknown as { Audio: unknown }
    const before = g.Audio
    g.Audio = class extends FakeAudio {
      constructor(src: string) {
        super(src)
        made.push(this)
      }
    }
    try {
      await playPreset("/adhan/commons-cc0.mp3", "commons-cc0")
      assert.equal(made[0].paused, false)
      stopSound()
      assert.equal(made[0].paused, true)
      assert.equal(made[0].currentTime, 0)
    } finally {
      g.Audio = before
    }
  })
  it("the notification carries «🔇 បិទសំឡេង» only while the Adhan plays", () => {
    const withAdhan = prayerNotificationOptions("13:05", "prayer-dhuhr", "🔇 បិទសំឡេង")
    assert.deepEqual(withAdhan.actions, [{ action: STOP_ADHAN_ACTION, title: "🔇 បិទសំឡេង" }])
    assert.equal(withAdhan.data.adhan, true)
    const chime = prayerNotificationOptions("13:05", "prayer-dhuhr")
    assert.equal("actions" in chime, false)
    assert.equal(chime.data.adhan, false)
  })
  it("the service worker relays the action (and a swipe-away) to the app, without opening a page", () => {
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
    assert.match(sw, /if \(event\.action === "stop-adhan"\) return event\.waitUntil\(stopAdhan\(\)\)/)
    assert.match(sw, /postMessage\(\{ type: "luychlat-stop-adhan" \}\)/)
    assert.match(sw, /notificationclose[\s\S]{0,120}data\.adhan\) event\.waitUntil\(stopAdhan\(\)\)/)
    // One click handler, so a tap is never handled (and navigated) twice.
    assert.equal(sw.match(/addEventListener\("notificationclick"/g)?.length, 1)
    assert.equal(isStopAdhanMessage({ type: STOP_ADHAN_MESSAGE }), true)
    assert.equal(isStopAdhanMessage({ type: "other" }), false)
  })
  it("the in-app banner's button is the 🔇 one", () => {
    const ui = readFileSync(join(process.cwd(), "src/components/islamic/prayer-alerts.tsx"), "utf8")
    assert.match(ui, /action: adhan \? \{ label: t\("prayerAlert\.stopAdhan"\), onClick: stopSound \}/)
  })
})

describe("The Adhan plays at the prayer minute — never silence (founder, 22/10/2026 — Task #466)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  type G = { Audio: unknown; window: unknown }
  const g = globalThis as unknown as G
  const swap = (audio: unknown, window: unknown) => {
    const before = { Audio: g.Audio, window: g.window }
    g.Audio = audio
    g.window = window
    return () => {
      g.Audio = before.Audio
      g.window = before.window
    }
  }

  it("Dhuhr 22/10: the browser refused sound (no tap yet) and the chime could not play either → «blocked», not a silent «chime»", async () => {
    class Refused extends FakeAudio {
      async play() {
        throw new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError")
      }
    }
    const restore = swap(Refused, {}) // no unlocked audio context
    try {
      assert.equal(await playAdhan({ presetFile: "/adhan/commons-cc0.mp3", presetId: "commons-cc0" }), "blocked")
    } finally {
      restore()
    }
  })

  it("the first tap unlocks ONE audio element and ONE context; the Adhan at the prayer minute plays through them", async () => {
    const made: FakeAudio[] = []
    class Ctx {
      state = "suspended"
      currentTime = 0
      async resume() {
        this.state = "running"
      }
    }
    const restore = swap(
      class extends FakeAudio {
        constructor(src = "") {
          super(src)
          made.push(this)
        }
      },
      { AudioContext: Ctx },
    )
    try {
      primeAdhanAudio() // inside the tap
      assert.equal(made.length, 1)
      assert.match(made[0].src, /^blob:/) // the 50 ms of silence
      assert.equal(await playAdhan({ presetFile: "/adhan/commons-cc0.mp3", presetId: "commons-cc0" }), "adhan") // later, from the timer
      assert.equal(made.length, 1, "the unlocked element, not a new (blocked) one")
      assert.equal(made[0].src, "/adhan/commons-cc0.mp3")
      assert.equal(made[0].paused, false)
      stopSound()
    } finally {
      restore()
    }
  })

  it("the unlocking sound is a valid, silent WAV", () => {
    const b = silentWav(50)
    const text = (at: number, n: number) => String.fromCharCode(...b.slice(at, at + n))
    assert.deepEqual([text(0, 4), text(8, 8), text(36, 4)], ["RIFF", "WAVEfmt ", "data"])
    assert.equal(b.length, 44 + 400)
    assert.ok(b.slice(44).every((x) => x === 128))
  })

  it("wired: unlocked on the first tap, a blocked Adhan becomes a ▶ banner, a 🔊 test button, the server never fails silently", () => {
    const ui = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(ui, /useEffect\(\(\) => \(alertsOn \? primeOnFirstTap\(\) : undefined\), \[alertsOn\]\)/)
    assert.match(ui, /if \(r === "blocked"\) blocked\(\)/)
    assert.match(ui, /action: \{ label: t\("prayerAlert\.tapToPlay"\)/)
    assert.match(ui, /onClick=\{testAdhan\}/)
    assert.match(ui, /primeAdhanAudio\(\) \/\/ this tap also unlocks/)
    assert.match(ui, /adhanForPrayer\("dhuhr", adhanPreset, fajrAdhan, !!adhanName, FAJR_ADHAN, global, defaults\)/)
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"prayerAlert.testAdhan": "🔊 សាកល្បងសំឡេងអាហ្សាន (Test Adhan)"'))
    const bot = read("src/lib/server/bot-dispatch.ts")
    assert.match(bot, /if \(error\) return logEvent\("error", "prayer", `Telegram prayer alerts: subscribers not read/)
    assert.match(bot, /if \(error\) return logEvent\("error", "prayer", `Prayer push: phones not read/)
  })
})

describe("«ជូនដំណឹងម៉ោងសឡាត» flips at once — never frozen (founder, 22/10/2026 — Task #467)", () => {
  it("on Android the switch waited for the exact-alarm settings screen: now ON first, the in-app Adhan on, the rest in the background", () => {
    const ui = readFileSync(join(process.cwd(), "src/components/islamic/prayer-alerts.tsx"), "utf8")
    const toggle = ui.slice(ui.indexOf("  const toggle = (on: boolean) => {"), ui.indexOf("  /** What rings with the app closed"))
    assert.ok(toggle.length > 0, "toggle found")
    assert.doesNotMatch(toggle, /await/) // nothing to wait for before the switch moves
    assert.match(toggle, /setAlerts\(\{ alertsOn: true \}\)\s+primeAdhanAudio\(\)[^\n]*\n\s+void extrasInBackground\(\)/)
    assert.match(ui, /onCheckedChange=\{toggle\}/)
    const extras = ui.slice(ui.indexOf("  const extrasInBackground = async () => {"), ui.indexOf("  const choose = (id: string) => {"))
    assert.match(extras, /withTimeout\(requestNativePrayerPermissions\(\), 20_000\)/) // Android's settings screen can't hang it
    assert.match(extras, /\} catch \{[\s\S]*toast\.success\(t\("prayerAlert\.onInApp"\)\)/) // a failed push never reverts it
    assert.doesNotMatch(extras, /alertsOn: false/)
  })
})

describe("The Adhan strictly per device (founder, 24/10/2026 — Task #488: at Dhuhr it rang on every phone)", () => {
  it("the switch lives on the phone; it sets this phone's server push on every launch; off cancels this phone's Android alarms", () => {
    const store = readFileSync(join(process.cwd(), "src/stores/islamic-local-store.ts"), "utf8")
    assert.match(store, /\{ name: "luychlat-islamic-local" \}/) // localStorage: this device only, never the account
    assert.doesNotMatch(store, /supabase|rpc\(/)
    const ui = readFileSync(join(process.cwd(), "src/components/islamic/prayer-alerts.tsx"), "utf8")
    assert.match(ui, /useEffect\(\(\) => \{\s+if \(!alertsOn\) void setPrayerPush\(false\)\.catch\(\(\) => false\)\s+\}, \[alertsOn\]\)/) // a launch only turns it off (Task #496)
    assert.doesNotMatch(ui, /setPrayerPush\(alertsOn\)/) // never «on» from a launch — only a tap on this device's switch
    assert.match(ui, /if \(!alertsOn\) \{\s+setNativeOn\(false\)\s+void cancelNativePrayers\(\)/)
    assert.match(readFileSync(join(process.cwd(), "src/lib/native-prayer.ts"), "utf8"), /await AdhanAlarm\.cancelAll\(\)\.catch\(\(\) => null\) \/\/ the alarm clock/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270254000000_prayer_push_per_device.sql"), "utf8")
    assert.match(sql, /alter column prayer_alerts set default false/) // a new browser never rings by default
    assert.match(sql, /update public\.push_subscriptions set prayer_alerts = false where prayer_alerts/)
    assert.ok(readFileSync(join(process.cwd(), "src/lib/i18n/dictionaries.ts"), "utf8").includes('"prayerAlert.thisDevice": "📱 សម្រាប់តែទូរសព្ទនេះ'))
  })
})

describe("The Adhan never on a phone that turned it off (founder, 24/10/2026 — Task #494: «zero tolerance»)", () => {
  const native = !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context"
  it("the receiver rings only an alarm still in this phone's plan; off clears the plan and cancels every alarm, the test too", { skip: native }, () => {
    const receiver = readFileSync(join(process.cwd(), "android/app/src/main/java/com/luychlat/app/AdhanAlarmReceiver.java"), "utf8")
    assert.match(receiver, /int id = intent\.getIntExtra\("id", 0\);\s+\/\/[^\n]+\n\s+if \(!AdhanAlarmPlugin\.planned\(context, id\)\) return;/)
    const plugin = readFileSync(join(process.cwd(), "android/app/src/main/java/com/luychlat/app/AdhanAlarmPlugin.java"), "utf8")
    assert.match(plugin, /alarms\.cancel\(fireIntent\(context, new JSONObject\(\)\.put\("id", TEST_ID\)\)\);/)
    assert.match(plugin, /static final int TEST_ID = 199_999_999;/)
    assert.match(plugin, /public void cancelAll\(PluginCall call\) \{\s+cancelAll\(getContext\(\)\);\s+prefs\(getContext\(\)\)\.edit\(\)\.remove\(KEY\)\.apply\(\);/)
  })
  it("off at launch cancels the native alarms; the server pushes only rows whose own device switched the Adhan on", () => {
    const alerts = readFileSync(join(process.cwd(), "src/components/islamic/prayer-alerts.tsx"), "utf8")
    assert.match(alerts, /if \(!alertsOn\) \{\s+setNativeOn\(false\)\s+void cancelNativePrayers\(\)/)
    assert.match(alerts, /if \(!alertsOn\) void setPrayerPush\(false\)/)
    assert.match(alerts, /if \(result === "granted"\) void enablePush\(\)\.then\(\(state\) => \(state === "on" \? setPrayerPush\(true\) : false\)\)/) // on: the tap only
    assert.match(readFileSync(join(process.cwd(), "src/lib/native-prayer.ts"), "utf8"), /export const NATIVE_TEST_ID = 199_999_999/)
  })
})
