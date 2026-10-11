import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { announceLate, announcementText, joinMp3, mp3Frames, audioPlan, chineseNumber, pollSince, soundboxWorkspace, KHMER_CLIPS, khmerClipSequence, keepScreenAwake, khmerNumber, receiveEvent, shouldEmit, shownAmount, spokenAmount, todayTotals } from "./soundbox"

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
  it("Chinese: riel and dollars in Chinese numerals", () => {
    assert.equal(announcementText({ amount: 50_000, currency: "KHR" }, "zh"), "收款五万瑞尔")
    assert.equal(announcementText({ amount: 5.5, currency: "USD" }, "zh"), "收款五点五美元")
    assert.equal(announcementText({ amount: 20, currency: "USD" }, "zh"), "收款二十美元")
    assert.equal(spokenAmount(5.05, "USD", "zh"), "五点零五美元")
    assert.equal(spokenAmount(0.75, "USD", "zh"), "零点七五美元")
    assert.equal(spokenAmount(12.5, "USD", "zh"), "十二点五美元")
  })
  it("Chinese numbers (万 / 亿, 零 for gaps, 两 as spoken)", () => {
    assert.equal(chineseNumber(10_000), "一万")
    assert.equal(chineseNumber(20_000), "两万")
    assert.equal(chineseNumber(100_000), "十万")
    assert.equal(chineseNumber(125_500), "十二万五千五百")
    assert.equal(chineseNumber(1_500_000), "一百五十万")
    assert.equal(chineseNumber(10_050), "一万零五十")
    assert.equal(chineseNumber(1_005), "一千零五")
    assert.equal(chineseNumber(2_000), "两千")
    assert.equal(chineseNumber(15), "十五")
    assert.equal(chineseNumber(100_000_000), "一亿")
    assert.equal(chineseNumber(100_020_000), "一亿零两万")
    assert.equal(chineseNumber(0), "零")
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

describe("SoundBox — Khmer from recorded clips (no Khmer voice on iPhones)", () => {
  it("the clips spell the same words as the Khmer text", () => {
    assert.deepEqual(khmerClipSequence(20_000, "KHR"), ["received", "2", "meun", "riel"])
    assert.deepEqual(khmerClipSequence(50_000, "KHR"), ["received", "5", "meun", "riel"])
    assert.deepEqual(khmerClipSequence(125_500, "KHR"), ["received", "1", "saen", "2", "meun", "5", "poan", "5", "roy", "riel"])
    assert.deepEqual(khmerClipSequence(1_500_000, "KHR"), ["received", "1", "lean", "5", "saen", "riel"])
    assert.deepEqual(khmerClipSequence(5.5, "USD"), ["received", "5", "dollar", "50", "cent"])
    assert.deepEqual(khmerClipSequence(12, "USD"), ["received", "10", "2", "dollar"])
    assert.deepEqual(khmerClipSequence(0.75, "USD"), ["received", "70", "5", "cent"])
  })
  it("every clip named is one of the 27 recorded files", () => {
    assert.equal(KHMER_CLIPS.length, 27)
    for (const amount of [1, 9, 10, 19, 99, 100, 999, 1_000, 9_999, 10_000, 99_999, 100_000, 999_999, 1_000_000, 12_345_678])
      for (const clip of khmerClipSequence(amount, "KHR")) assert.ok((KHMER_CLIPS as readonly string[]).includes(clip), `${amount}: ${clip}`)
  })
})

describe("SoundBox — never silent by accident (11/10: 8,000 ៛ and 3,300 ៛ were emitted but not heard)", () => {
  const now = Date.parse("2026-10-11T01:25:00Z")
  it("a payment caught by the backup check is announced only if it is under 5 minutes old", () => {
    assert.ok(announceLate("2026-10-11T01:22:57Z", now))
    assert.ok(!announceLate("2026-10-11T01:19:00Z", now + 5 * 60_000))
    assert.ok(!announceLate(undefined, now))
  })
  it("the backup check resumes after the newest event seen", () => {
    assert.equal(pollSince([{ created_at: "2026-10-11T01:19:38Z" }, { created_at: "2026-10-11T01:22:57Z" }], now), "2026-10-11T01:22:57Z")
    assert.equal(pollSince([], now), new Date(now).toISOString())
  })
  it("the counter shows the business's codes even while the Personal workspace is open", () => {
    const personal = { id: "p", type: "PERSONAL" }
    const dl = { id: "dl", type: "BUSINESS" }
    assert.equal(soundboxWorkspace(personal, [personal, dl])?.id, "dl")
    assert.equal(soundboxWorkspace(dl, [personal, dl])?.id, "dl")
    assert.equal(soundboxWorkspace(personal, [personal])?.id, "p")
  })
})

describe("SoundBox — the Telegram voice note joined from the clips", () => {
  const frame = (n: number) => new Uint8Array([0xff, 0xfb, 0x90, n])
  const id3 = (body: number[]) => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 3, 1, 2, 3, ...body])
  it("tags are stripped (ID3v2 in front, ID3v1 at the end); plain audio is kept as is", () => {
    assert.deepEqual([...mp3Frames(id3([0xff, 0xfb, 0x90, 7]))], [0xff, 0xfb, 0x90, 7])
    const v1 = new Uint8Array([...frame(1), 0x54, 0x41, 0x47, ...new Array(125).fill(0)])
    assert.deepEqual([...mp3Frames(v1)], [...frame(1)])
    assert.deepEqual([...mp3Frames(frame(9))], [...frame(9)])
  })
  it("the clips' frames back to back, in order", () => {
    assert.deepEqual([...joinMp3([id3([...frame(1)]), frame(2), frame(3)])], [...frame(1), ...frame(2), ...frame(3)])
  })
})
