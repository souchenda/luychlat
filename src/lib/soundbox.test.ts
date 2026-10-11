import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { announcementText, audioPlan, keepScreenAwake, khmerNumber, receiveEvent, shouldEmit, shownAmount, spokenAmount, todayTotals } from "./soundbox"

describe("SoundBox — which payments are announced", () => {
  it("a recorded customer payment only", () => {
    assert.equal(shouldEmit("ok"), true)
    for (const status of ["transfer", "duplicate", "invalid", "no_wallet", "plan_required", "unauthorized", undefined]) assert.equal(shouldEmit(status), false, String(status))
  })
})

describe("SoundBox — Khmer numbers as spoken (ម៉ឺន / សែន)", () => {
  it("round amounts", () => {
    assert.equal(khmerNumber(10_000), "មួយម៉ឺន")
    assert.equal(khmerNumber(20_000), "ពីរម៉ឺន")
    assert.equal(khmerNumber(50_000), "ប្រាំម៉ឺន")
    assert.equal(khmerNumber(100_000), "មួយសែន")
    assert.equal(khmerNumber(1_000_000), "មួយលាន")
  })
  it("composite amounts", () => {
    assert.equal(khmerNumber(15_000), "មួយម៉ឺនប្រាំពាន់")
    assert.equal(khmerNumber(125_500), "មួយសែនពីរម៉ឺនប្រាំពាន់ប្រាំរយ")
    assert.equal(khmerNumber(1_500_000), "មួយលានប្រាំសែន")
    assert.equal(khmerNumber(12_300_000), "ដប់ពីរលានបីសែន")
    assert.equal(khmerNumber(4_100), "បួនពាន់មួយរយ")
    assert.equal(khmerNumber(21), "ម្ភៃមួយ")
    assert.equal(khmerNumber(90), "កៅសិប")
    assert.equal(khmerNumber(0), "សូន្យ")
  })
})

describe("SoundBox — what is said, in three languages", () => {
  it("Khmer: riel and dollars", () => {
    assert.equal(announcementText({ amount: 50_000, currency: "KHR" }, "km"), "ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល")
    assert.equal(announcementText({ amount: 5.5, currency: "USD" }, "km"), "ទទួលបានប្រាក់ ប្រាំដុល្លារ ហាសិបសេន")
    assert.equal(spokenAmount(12, "USD", "km"), "ដប់ពីរដុល្លារ")
    assert.equal(spokenAmount(0.75, "USD", "km"), "ចិតសិបប្រាំសេន")
  })
  it("English: riel and dollars", () => {
    assert.equal(announcementText({ amount: 50_000, currency: "KHR" }, "en"), "Received 50,000 riel")
    assert.equal(announcementText({ amount: 5.5, currency: "USD" }, "en"), "Received 5 dollars and 50 cents")
    assert.equal(announcementText({ amount: 1, currency: "USD" }, "en"), "Received 1 dollar")
    assert.equal(announcementText({ amount: 0.01, currency: "USD" }, "en"), "Received 1 cent")
  })
  it("Chinese: riel and dollars", () => {
    assert.equal(announcementText({ amount: 50_000, currency: "KHR" }, "zh"), "收款 50,000 瑞尔")
    assert.equal(announcementText({ amount: 20, currency: "USD" }, "zh"), "收款 20 美元")
    assert.equal(announcementText({ amount: 5.5, currency: "USD" }, "zh"), "收款 5 美元 50 美分")
  })
  it("on screen", () => {
    assert.equal(shownAmount(50_000, "KHR"), "+50,000 ៛")
    assert.equal(shownAmount(20, "USD"), "+$20.00")
    assert.equal(shownAmount(12.5, "USD"), "+$12.50")
  })
})

describe("SoundBox — audio triggers", () => {
  const all = { km: true, en: true, zh: true }
  it("nothing until unlocked by a tap, or with the sound off", () => {
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: false, mode: "km", voices: all }), [])
    assert.deepEqual(audioPlan({ soundOn: false, unlocked: true, mode: "km", voices: all }), [])
  })
  it("chime, then the voice(s) of the mode in order", () => {
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "zh", voices: all }), ["chime", "speech:zh"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km+en", voices: all }), ["chime", "speech:km", "speech:en"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km+zh", voices: all }), ["chime", "speech:km", "speech:zh"])
  })
  it("no Khmer voice on the device: English instead (once); nothing to speak: a melody", () => {
    const noKm = { km: false, en: true, zh: true }
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km", voices: noKm }), ["chime", "speech:en"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km+en", voices: noKm }), ["chime", "speech:en"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km+zh", voices: noKm }), ["chime", "speech:en", "speech:zh"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, mode: "km", voices: {} }), ["chime", "melody"])
  })
})

describe("SoundBox — receiving events", () => {
  const row = { id: "e1", amount: "50000.00", currency: "KHR", account_name: "ABA KHR", payer: "SOK DARA", payer_bank: "ABA Bank", transaction_time: "2026-10-11T03:00:00Z" }
  it("a Realtime row becomes the event (numbers from strings), newest first", () => {
    const first = receiveEvent([], row)
    assert.equal(first.added?.amount, 50_000)
    assert.equal(first.added?.payer_bank, "ABA Bank")
    const second = receiveEvent(first.list, { ...row, id: "e2", amount: 12.5, currency: "USD" })
    assert.deepEqual(second.list.map((e) => e.id), ["e2", "e1"])
  })
  it("the same payment twice is kept (and announced) once; a malformed row is ignored", () => {
    const once = receiveEvent([], row)
    assert.equal(receiveEvent(once.list, row).added, null)
    assert.equal(receiveEvent([], { ...row, amount: "-1" }).added, null)
    assert.equal(receiveEvent([], { ...row, currency: "EUR" }).added, null)
  })
  it("today's receipts per currency (Cambodia day)", () => {
    const events = [
      { amount: 50_000, currency: "KHR" as const, transaction_time: "2026-10-11T02:00:00Z" },
      { amount: 12.5, currency: "USD" as const, transaction_time: "2026-10-11T10:00:00Z" },
      { amount: 7, currency: "USD" as const, transaction_time: "2026-10-10T16:30:00Z" }, // 23:30 on the 10th in Cambodia: yesterday
    ]
    assert.deepEqual(todayTotals(events, "2026-10-11"), { count: 2, khr: 50_000, usd: 12.5 })
  })
})

describe("SoundBox — screen wake lock", () => {
  const fakes = (supported = true) => {
    const log: string[] = []
    const listeners = new Set<() => void>()
    const doc = {
      visibilityState: "visible",
      addEventListener: (_: "visibilitychange", f: () => void) => void listeners.add(f),
      removeEventListener: (_: "visibilitychange", f: () => void) => void listeners.delete(f),
    }
    const nav = supported
      ? { wakeLock: { request: async () => (log.push("lock"), { release: async () => void log.push("release") }) } }
      : {}
    return { log, listeners, doc, nav }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it("locks now, again when the page is shown, and releases on stop", async () => {
    const f = fakes()
    const stop = keepScreenAwake(f.nav, f.doc)
    await tick()
    assert.deepEqual(f.log, ["lock"])
    f.doc.visibilityState = "visible"
    for (const l of f.listeners) l()
    await tick()
    assert.deepEqual(f.log, ["lock", "lock"])
    stop()
    await tick()
    assert.equal(f.listeners.size, 0)
    assert.equal(f.log.at(-1), "release")
  })
  it("a hidden page doesn't ask; a browser without the API simply doesn't lock", async () => {
    const f = fakes()
    keepScreenAwake(f.nav, f.doc)()
    f.doc.visibilityState = "hidden"
    const g = fakes(false)
    const stop = keepScreenAwake(g.nav, g.doc)
    await tick()
    assert.deepEqual(g.log, [])
    stop()
  })
})
