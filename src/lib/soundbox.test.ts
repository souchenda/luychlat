import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { announcementText, audioPlan, khmerNumber, shouldEmit, shownAmount, spokenAmount, todayTotals } from "./soundbox"

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

describe("SoundBox — what is said and shown", () => {
  it("riel and dollars in Khmer", () => {
    assert.equal(spokenAmount(50_000, "KHR", "km"), "ប្រាំម៉ឺនរៀល")
    assert.equal(spokenAmount(5.5, "USD", "km"), "ប្រាំដុល្លារ ហាសិបសេន")
    assert.equal(spokenAmount(12, "USD", "km"), "ដប់ពីរដុល្លារ")
    assert.equal(spokenAmount(0.75, "USD", "km"), "ចិតសិបប្រាំសេន")
    assert.equal(announcementText({ amount: 20_000, currency: "KHR" }, "km"), "ទទួលបានប្រាក់ ពីរម៉ឺនរៀល")
  })
  it("English", () => {
    assert.equal(announcementText({ amount: 50_000, currency: "KHR" }, "en"), "Received 50,000 riel")
    assert.equal(announcementText({ amount: 5.5, currency: "USD" }, "en"), "Received 5 dollars and 50 cents")
    assert.equal(announcementText({ amount: 1, currency: "USD" }, "en"), "Received 1 dollar")
  })
  it("on screen", () => {
    assert.equal(shownAmount(50_000, "KHR"), "+50,000 ៛")
    assert.equal(shownAmount(12.5, "USD"), "+$12.50")
  })
})

describe("SoundBox — audio triggers", () => {
  it("nothing until unlocked by a tap, or with the sound off", () => {
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: false, voice: true }), [])
    assert.deepEqual(audioPlan({ soundOn: false, unlocked: true, voice: true }), [])
  })
  it("chime then the voice; a melody when the device has no voice for the language", () => {
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, voice: true }), ["chime", "speech"])
    assert.deepEqual(audioPlan({ soundOn: true, unlocked: true, voice: false }), ["chime", "melody"])
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
