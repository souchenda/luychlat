import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { usePrefsStore } from "@/stores/prefs-store"
import { useLockStore } from "@/stores/lock-store"

import { eyeAction, NO_FAILURES, readRevealState, REVEAL_COOLDOWN_MS, REVEAL_IDLE_MS, REVEAL_MAX_ATTEMPTS, revealFailure, revealTriesLeft, revealWaitSeconds } from "./balance-reveal"
import { hashPin, verifyPin } from "./pin"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Balances behind a 6-digit PIN (founder, 23/10/2026 — Task #477)", () => {
  it("the eye: masks at once; reveals at once without the lock; asks for the PIN with the lock on and a PIN set", () => {
    assert.equal(eyeAction({ hidden: false, lockOn: true, hasPin: true }), "hide") // never a PIN to mask
    assert.equal(eyeAction({ hidden: true, lockOn: false, hasPin: true }), "reveal")
    assert.equal(eyeAction({ hidden: true, lockOn: true, hasPin: false }), "reveal") // no PIN yet: nothing to ask
    assert.equal(eyeAction({ hidden: true, lockOn: true, hasPin: true }), "ask-pin")
  })

  it("the store: with the lock on the eye raises a request instead of revealing; the PIN gate is the only reveal", () => {
    useLockStore.setState({ pinHash: "x", pinSalt: "y" })
    usePrefsStore.setState({ hideBalances: true, balancePinLock: true, revealRequest: 0 })
    usePrefsStore.getState().toggleHideBalances()
    assert.deepEqual([usePrefsStore.getState().hideBalances, usePrefsStore.getState().revealRequest], [true, 1])
    usePrefsStore.setState({ hideBalances: false })
    usePrefsStore.getState().toggleHideBalances()
    assert.equal(usePrefsStore.getState().hideBalances, true) // masked at once
    usePrefsStore.setState({ balancePinLock: false })
    usePrefsStore.getState().toggleHideBalances()
    assert.equal(usePrefsStore.getState().hideBalances, false) // the lock off: as before
    useLockStore.setState({ pinHash: null, pinSalt: null })
    usePrefsStore.setState({ hideBalances: true, balancePinLock: false, revealRequest: 0 })
  })

  it("five wrong PINs in a row → 30 s before the next try; the count starts over after the wait", () => {
    let s = NO_FAILURES
    const now = 1_000_000
    for (let i = 1; i < REVEAL_MAX_ATTEMPTS; i++) {
      s = revealFailure(s, now)
      assert.equal(revealTriesLeft(s), REVEAL_MAX_ATTEMPTS - i)
      assert.equal(revealWaitSeconds(s, now), 0)
    }
    s = revealFailure(s, now) // the fifth
    assert.deepEqual(s, { failed: 0, until: now + REVEAL_COOLDOWN_MS })
    assert.equal(revealWaitSeconds(s, now), 30)
    assert.equal(revealWaitSeconds(s, now + 29_001), 1)
    assert.equal(revealWaitSeconds(s, now + 30_000), 0)
    assert.equal(REVEAL_IDLE_MS, 60_000)
  })

  it("the saved state survives a reload; anything unreadable is no failures (never a lock-out by a broken value)", () => {
    assert.deepEqual(readRevealState(JSON.stringify({ failed: 3, until: null })), { failed: 3, until: null })
    assert.deepEqual(readRevealState(JSON.stringify({ failed: 0, until: 123 })), { failed: 0, until: 123 })
    for (const bad of [null, "", "{", "[]", JSON.stringify({ failed: -1 }), JSON.stringify({ failed: 99 }), JSON.stringify({ failed: "x", until: "y" })])
      assert.deepEqual(readRevealState(bad), NO_FAILURES, String(bad))
  })

  it("the PIN is never stored in plain text: PBKDF2-SHA256 with its own random salt", async () => {
    const a = await hashPin("824613")
    const b = await hashPin("824613")
    assert.notEqual(a.salt, b.salt)
    assert.notEqual(a.hash, b.hash)
    assert.ok(!a.hash.includes("824613") && !a.salt.includes("824613"))
    assert.equal(await verifyPin("824613", a.hash, a.salt), true)
    assert.equal(await verifyPin("824614", a.hash, a.salt), false)
  })

  it("wired: the gate in the app, the keypad that shakes and clears, the idle mask, the Settings switch and PIN setup", () => {
    assert.match(read("src/components/providers.tsx"), /<BalancePrivacyGuard \/>\s+<BalanceRevealGate \/>/)
    const gate = read("src/components/security/balance-reveal-gate.tsx")
    assert.match(gate, /const ok = await verifyPin\(pin, pinHash, pinSalt\)/)
    assert.match(gate, /if \(revealWaitSeconds\(load\(\), Date\.now\(\)\)\) return/) // no try during the wait
    assert.match(gate, /window\.setTimeout\(\(\) => setHideBalances\(true\), REVEAL_IDLE_MS\)/)
    assert.match(gate, /if \(request === seen\.current\) return/) // a saved request never opens the sheet by itself
    assert.match(read("src/components/lock/pin-pad.tsx"), /error && "animate-shake"/)
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /<FlipToHideRow \/>\s+<BalancePinRow \/>/)
    assert.match(settings, /if \(v && !hasPin\) return setSetup\("enable"\)/) // a PIN first: enter 6 → confirm
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"balancePin.toggle": "ចាក់សោរសមតុល្យដោយលេខកូដ 6 ខ្ទង់"'))
  })
})
