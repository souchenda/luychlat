// GOLDEN PATH 3 — SoundBox alerts (sales only, the Khmer amount, stays on, the locked-screen push).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { khmerClipSequence, readSoundboxEnabled, receiveEvent, shouldEmit, soundboxPush, writeSoundboxEnabled } from "../../src/lib/soundbox"

describe("GOLDEN 3 · SoundBox alerts", () => {
  it("only a customer's sale is announced — never an own transfer or an unknown status", () => {
    assert.equal(shouldEmit("ok"), true)
    assert.equal(shouldEmit("transfer"), false)
    assert.equal(shouldEmit(undefined), false)
  })
  it("«ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល»: 50,000 ៛ is received + 5 + ម៉ឺន + រៀល", () => {
    assert.deepEqual(khmerClipSequence(50_000, "KHR"), ["received", "5", "meun", "riel"])
  })
  it("a payment is listed and announced once, even if it arrives twice (live + the backup check)", () => {
    const row = { id: "e1", workspace_id: "w", amount: 50_000, currency: "KHR", transaction_time: "2026-10-14T02:00:00Z", created_at: "2026-10-14T02:00:01Z" }
    const first = receiveEvent([], row)
    assert.ok(first.added)
    assert.equal(receiveEvent(first.list, row).added, null)
  })
  it("turned on, it stays on after a reload; only «🔇 បិទសំឡេង» turns it off", () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    writeSoundboxEnabled(store, "dl", true)
    assert.equal(readSoundboxEnabled(store, "dl"), true)
    writeSoundboxEnabled(store, "dl", false)
    assert.equal(readSoundboxEnabled(store, "dl"), false)
  })
  it("screen locked: the push carries the amount", () => {
    assert.match(soundboxPush({ id: "t", amount: 5, currency: "USD" }).title, /^💰 ទទួលបានប្រាក់ /)
  })
  it("the phone's audio is never held: no looping media, no Media Session; released after each announcement (founder, 14/10/2026 — it muted Telegram voice notes on iPhone)", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "soundbox-audio.ts"), "utf8")
    assert.doesNotMatch(src, /\.loop\s*=\s*true/)
    assert.doesNotMatch(src, /mediaSession|new Audio\(/)
    assert.match(src, /ctx\.suspend\(/)
    assert.match(src, /finally \{[\s\S]{0,160}?release\(\)/)
  })
})
