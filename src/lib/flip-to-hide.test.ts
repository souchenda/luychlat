import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { restorePrefs, usePrefsStore } from "@/stores/prefs-store"

import { createFlipDetector, FLIP_DEGREES, FLIP_HOLD_MS, requestMotionPermission } from "./flip-to-hide"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Feeds readings every 50 ms; returns the times it fired. */
const run = (betas: number[], d = createFlipDetector()) => betas.flatMap((b, i) => (d.sample(b, i * 50) ? [i * 50] : []))

describe("Flip to hide (founder, 22/10/2026 — Task #461)", () => {
  it("face down for a quarter of a second → hidden, once; turned up and down again → once more", () => {
    assert.deepEqual([FLIP_DEGREES, FLIP_HOLD_MS], [150, 250])
    // Face up (0°), then laid face down (178°) and left there: fires at 250 ms of being down, never again while down.
    assert.deepEqual(run([0, 10, 178, 179, 178, 179, 180, 179, 178, 179]), [350])
    // iPhone and Android alike: face down reads ±180°.
    assert.deepEqual(run([0, -178, -179, -180, -179, -178, -179]), [300]) // down from 50 ms → 300 ms
    const d = createFlipDetector()
    assert.deepEqual(run([0, 179, 179, 179, 179, 179, 179, 0, 179, 179, 179, 179, 179, 179], d), [300, 650])
  })
  it("not on a walk or a quick tilt: a brief dip, a phone held at an angle, or no sensor never hides", () => {
    assert.deepEqual(run([0, 160, 170, 20, 165, 30, 175, 10, 155, 5]), []) // swings under 250 ms
    assert.deepEqual(run([120, 130, 140, 145, 140, 130, 120, 140, 145]), []) // tilted, not face down (< 150°)
    assert.deepEqual(run([NaN, NaN, NaN, NaN, NaN, NaN, NaN]), [])
    const d = createFlipDetector()
    assert.equal(d.sample(null, 0) || d.sample(undefined, 500), false)
  })
  it("iOS asks first — from a tap; elsewhere nothing to ask; refused or asked outside a tap → no flip, never an error", async () => {
    assert.equal(await requestMotionPermission(undefined), "not-needed")
    assert.equal(await requestMotionPermission({}), "not-needed")
    assert.equal(await requestMotionPermission({ requestPermission: async () => "granted" }), "granted")
    assert.equal(await requestMotionPermission({ requestPermission: async () => "denied" }), "denied")
    assert.equal(
      await requestMotionPermission({
        requestPermission: async () => {
          throw new Error("requires a user gesture")
        },
      }),
      "denied",
    )
  })
  it("the setting: on by default, kept across launches — while the balances still start hidden (golden privacy)", () => {
    assert.equal(usePrefsStore.getState().flipToHide, true)
    usePrefsStore.getState().setFlipToHide(false)
    assert.equal(usePrefsStore.getState().flipToHide, false)
    usePrefsStore.getState().setFlipToHide(true)
    const restored = restorePrefs({ flipToHide: false, hideBalances: false }, usePrefsStore.getState())
    assert.deepEqual([restored.flipToHide, restored.hideBalances], [false, true])
  })
  it("wired: the listener hides and buzzes 50 ms, only while shown; iOS asked from the eye's tap and the switch; the row in Settings", () => {
    const l = read("src/components/privacy/flip-to-hide.tsx")
    assert.match(l, /if \(!on \|\| hidden \|\| typeof window === "undefined" \|\| !\("DeviceOrientationEvent" in window\)\) return/)
    assert.match(l, /if \(!detector\.sample\(e\.beta, e\.timeStamp \|\| performance\.now\(\)\)\) return\s*setHidden\(true\)\s*navigator\.vibrate\?\.\(50\)/)
    assert.doesNotMatch(l, /setHidden\(false\)/) // flipping only ever hides
    assert.match(read("src/app/(app)/layout.tsx"), /<FlipToHideListener \/>/)
    assert.match(read("src/components/wallets/net-worth-card.tsx"), /if \(hideBalances && flipToHide\) askMotionOnce\(\)\s*toggleHideBalances\(\)/)
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /<\/SettingsRow>\s*<FlipToHideRow \/>/)
    assert.match(settings, /set\(v\)\s*if \(v\) askMotionOnce\(\)/)
    assert.match(read("src/lib/i18n/dictionaries.ts"), /"settings\.flipToHide": "ផ្កាប់ទូរសព្ទដើម្បីលាក់សមតុល្យ \(Flip to Hide\)"/)
  })
})
