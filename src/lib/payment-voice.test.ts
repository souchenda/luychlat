import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { usePrefsStore } from "@/stores/prefs-store"

import { counterModeActive, paymentClips, paymentSpeech, SOUND_TESTS } from "./payment-chime"

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
  it("KHMER ONLY (Task #463): no Khmer voice — a Windows PC, an iPhone — never an English voice; the recorded Khmer clips instead", () => {
    assert.equal(paymentSpeech({ amount: 50_000, currency: "KHR" }, [{ lang: "en-US", name: "Microsoft David" }]), null)
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, [{ lang: "en-GB", name: "Daniel" }]), null)
    assert.equal(paymentSpeech({ amount: 25, currency: "USD" }, []), null)
    assert.deepEqual(paymentClips({ amount: 50_000, currency: "KHR" }), ["/audio/soundbox/khmer/received.mp3", "/audio/soundbox/khmer/5.mp3", "/audio/soundbox/khmer/meun.mp3", "/audio/soundbox/khmer/riel.mp3"])
    assert.ok(paymentClips({ amount: 10, currency: "USD" }).at(-1)?.endsWith("/dollar.mp3"))
  })
  it("wired: the chime first, then the voice — in the browser and after the Android notification's own chime", () => {
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /playPaymentChimeSound\(\(\) => speakPayment\(e\)\)/)
    assert.match(l, /window\.setTimeout\(\(\) => speakPayment\(e\), SPEECH_AFTER_CHIME_MS\)/)
    assert.match(l, /const say = typeof SpeechSynthesisUtterance === "undefined" \? null : paymentSpeech\(e, voices\)[\s\S]*?const u = new SpeechSynthesisUtterance\(say\.text\)\n\s+u\.lang = say\.tag/)
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

describe("The SoundBox engine stays connected and Khmer (founder, 22/10/2026 — Task #463)", () => {
  it("reconnects 2 s, 4 s, 8 s … up to 30 s; the counter phone shows whether it is listening", async () => {
    const { reconnectDelay } = await import("./soundbox")
    assert.deepEqual([0, 1, 2, 3, 9].map(reconnectDelay), [2000, 4000, 8000, 16000, 30000])
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /useLiveStatus\.getState\(\)\.setLive\(false\)\s*retry = window\.setTimeout\(connect, reconnectDelay\(attempt\+\+\)\)/)
    assert.match(l, /if \(attempt > 0\) new Audio\(PAYMENT_CHIME_URL\)\.load\(\)/) // the chime ready again after a drop
    assert.match(read("src/components/soundbox/live-pill.tsx"), /t\(live \? "soundbox\.liveOn" : "soundbox\.reconnecting"\)/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.match(km, /"soundbox\.liveOn": "SoundBox កំពុងដំណើរការ"/)
    assert.match(km, /"soundbox\.reconnecting": "កំពុងភ្ជាប់ឡើងវិញ\.\.\."/)
  })
  it("no Khmer voice → the clips when the server has them, else nothing after the chime; the Settings test: 50,000៛ and $10.00", () => {
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /if \(!say \|\| !synth\) \{\s*void khmerClipsAvailable\(\)\.then\(\(ok\) => \(ok \? playClips\(paymentClips\(e, voiceSpeed\(\)\)\) : undefined\)\)/) // in the chosen speed (Task #465)
    assert.doesNotMatch(read("src/lib/payment-chime.ts"), /for \(const lang of \["km", "en"\]/)
    assert.deepEqual(SOUND_TESTS, [{ amount: 50_000, currency: "KHR" }, { amount: 10, currency: "USD" }])
    assert.match(read("src/app/(app)/settings/page.tsx"), /onClick=\{\(\) => playPaymentChimeSound\(\(\) => speakPayment\(s\)\)\}/)
  })
})

describe("The SoundBox status pill on /soundbox only (founder, 22/10/2026)", () => {
  it("never floats over the home header (avatar, workspace, language, bell): the app layout shows no pill; the SoundBox page does", () => {
    const keeper = read("src/components/payments/counter-mode.tsx")
    assert.doesNotMatch(keeper, /soundbox\.liveOn|role="status"|fixed top-/)
    assert.match(keeper, /keepScreenAwake\(navigator/) // counter mode still keeps the screen on
    const pill = read("src/components/soundbox/live-pill.tsx")
    assert.doesNotMatch(pill, /fixed/) // in the page's flow, never over the header
    assert.match(read("src/app/(app)/soundbox/page.tsx"), /<SettingsSubHeader title=\{t\("soundbox\.title"\)\} back="\/home" \/>\s+<SoundboxLivePill \/>/)
    const layout = read("src/app/(app)/layout.tsx")
    assert.doesNotMatch(layout, /SoundboxLivePill|live-pill/)
  })
})
