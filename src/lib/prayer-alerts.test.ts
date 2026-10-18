import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isStopAdhanMessage, playPreset, prayerNotificationOptions, STOP_ADHAN_ACTION, STOP_ADHAN_MESSAGE, stopSound } from "./prayer-alerts"

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
