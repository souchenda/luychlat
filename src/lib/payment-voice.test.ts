import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { usePrefsStore } from "@/stores/prefs-store"

import { counterModeActive, paymentSpeech } from "./payment-chime"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const KM = [{ lang: "km-KH", name: "Khmer" }, { lang: "en-US", name: "Sam" }]

describe("The spoken payment, like a bank soundbox (founder, 21/10/2026 — Task #442)", () => {
  it("«ទទួលបានប្រាក់ …» in Khmer words — riel and dollars, cents too", () => {
    assert.deepEqual(paymentSpeech({ amount: 50_000, currency: "KHR" }, KM), { lang: "km", tag: "km-KH", voice: "Khmer", text: "ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល" })
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, KM)?.text, "ទទួលបានប្រាក់ ម្ភៃប្រាំដុល្លារ")
    assert.equal(paymentSpeech({ amount: 12.5, currency: "USD" }, KM)?.text, "ទទួលបានប្រាក់ ដប់ពីរដុល្លារ ហាសិបសេន")
    assert.equal(paymentSpeech({ amount: 51_500, currency: "KHR" }, KM)?.text, "ទទួលបានប្រាក់ ប្រាំម៉ឺនមួយពាន់ប្រាំរយរៀល")
    // A voice listed as «km_KH» (Android) counts as Khmer.
    assert.equal(paymentSpeech({ amount: 100, currency: "KHR" }, [{ lang: "km_KH" }])?.lang, "km")
  })
  it("no Khmer voice on the device (an iPhone): English, as the SoundBox does; no voice at all: nothing (the chime stays)", () => {
    assert.deepEqual(paymentSpeech({ amount: 50_000, currency: "KHR" }, [{ lang: "en-GB", name: "Daniel" }]), { lang: "en", tag: "en-US", voice: "Daniel", text: "Received 50,000 riel" })
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, [{ lang: "en-US" }])?.text, "Received 25 dollars")
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, []), null)
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, [{ lang: "fr-FR" }]), null)
  })
  it("wired: the chime first, then the voice — in the browser and after the Android notification's own chime", () => {
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /playPaymentChimeSound\(\(\) => speakPayment\(e\)\)/)
    assert.match(l, /window\.setTimeout\(\(\) => speakPayment\(e\), SPEECH_AFTER_CHIME_MS\)/)
    assert.match(l, /const say = paymentSpeech\(e, voices\)\n\s+if \(!say\) return\n\s+const u = new SpeechSynthesisUtterance\(say\.text\)\n\s+u\.lang = say\.tag/)
    // Spoken only on screen; the SoundBox audio module stays the SoundBox page's alone (golden 6).
    assert.match(l, /document\.visibilityState !== "visible"\) return/)
    assert.doesNotMatch(l, /soundbox-audio/)
  })
})

describe("Counter Soundbox Mode (Task #442)", () => {
  it("a Business workspace's phone only; turning it on turns the chime and the voice on; off leaves the chime as it is", () => {
    assert.deepEqual([counterModeActive({ on: true, business: true }), counterModeActive({ on: true, business: false }), counterModeActive({ on: false, business: true })], [true, false, false])
    const s = usePrefsStore.getState()
    assert.equal(s.counterMode, false) // off by default
    s.setPaymentChime(false)
    usePrefsStore.getState().setCounterMode(true)
    assert.deepEqual([usePrefsStore.getState().counterMode, usePrefsStore.getState().paymentChime], [true, true])
    usePrefsStore.getState().setCounterMode(false)
    assert.deepEqual([usePrefsStore.getState().counterMode, usePrefsStore.getState().paymentChime], [false, true])
  })
  it("wired: the screen kept on everywhere in the app while active; the switch in Settings for Business owners", () => {
    const keeper = read("src/components/payments/counter-mode.tsx")
    assert.match(keeper, /const active = counterModeActive\(\{ on, business \}\)/)
    assert.match(keeper, /if \(!active\) return\n\s+return keepScreenAwake\(navigator/)
    assert.match(read("src/app/(app)/layout.tsx"), /<PaymentChimeListener \/>\s+<CounterModeKeeper \/>/)
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /function CounterModeRow\(\) \{[\s\S]*?if \(!business\) return null[\s\S]*?set\(v\)/)
    assert.match(settings, /<PaymentChimeRow \/>\s+<CounterModeRow \/>/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.match(km, /"settings\.counterMode": "🏪 មុខងារ Soundbox លើតុគិតលុយ \(Counter Soundbox Mode\)"/)
  })
})
