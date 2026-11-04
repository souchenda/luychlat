import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { CLOSING_CLIPS, closingClipSequence, closingDue, DEFAULT_CLOSING, KHMER_CLIPS, khmerClipUrl, readClosing, VOICE_SPEEDS } from "./soundbox"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
/** 4/11/2026 at hh:mm Cambodia time. */
const at = (hh: number, mm = 0) => Date.parse(`2026-11-04T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`)
const on = { on: true, time: "21:00", spoken: null }

describe("SoundBox closing summary — today's total spoken at closing time (founder, 4/11/2026)", () => {
  it("«សរុបថ្ងៃនេះ 1,200,000 រៀល និង 45 ដុល្លារ · ការលក់ 23 ដង · អរគុណ» as the clips, exact amounts", () => {
    assert.deepEqual(closingClipSequence({ khr: 1_200_000, usd: 45, count: 23 }), ["today_total", "1", "lean", "2", "saen", "riel", "and", "40", "5", "dollar", "sales", "20", "3", "times", "thanks"])
    // Dollars and cents, no riel: no «និង».
    assert.deepEqual(closingClipSequence({ khr: 0, usd: 12.5, count: 2 }), ["today_total", "10", "2", "dollar", "50", "cent", "sales", "2", "times", "thanks"])
    // Exact riel the banks stated — never rounded to 100 ៛ (15,050 stays 15,050).
    assert.deepEqual(closingClipSequence({ khr: 15_050, usd: 0, count: 1 }), ["today_total", "1", "meun", "5", "poan", "50", "riel", "sales", "1", "times", "thanks"])
    assert.equal(closingClipSequence({ khr: 0, usd: 0, count: 0 }), null)
  })

  it("every clip the summary can use exists, at every speed", { skip: !existsSync(join(process.cwd(), "public/audio/soundbox/khmer")) && "no audio in the build context" }, () => {
    for (const speed of VOICE_SPEEDS)
      for (const clip of [...KHMER_CLIPS, ...CLOSING_CLIPS]) assert.ok(existsSync(join(process.cwd(), "public", khmerClipUrl(clip, speed))), `${clip} x${speed}`)
  })

  it("once a day, within the hour after the closing time, only when switched on", () => {
    assert.equal(closingDue(on, at(20, 59)), false)
    assert.equal(closingDue(on, at(21, 0)), true)
    assert.equal(closingDue(on, at(21, 59)), true)
    assert.equal(closingDue(on, at(22, 0)), false) // a phone opened late says nothing
    assert.equal(closingDue({ ...on, spoken: "2026-11-04" }, at(21, 5)), false)
    assert.equal(closingDue({ ...on, spoken: "2026-11-03" }, at(21, 5)), true)
    assert.equal(closingDue({ ...on, on: false }, at(21, 5)), false)
    assert.equal(closingDue({ ...on, time: "18:30" }, at(18, 45)), true)
  })

  it("the stored choice: off by default at 21:00; a broken value falls back, never throws", () => {
    const store = (v: string | null) => ({ getItem: () => v })
    assert.deepEqual(readClosing(store(null)), DEFAULT_CLOSING)
    assert.equal(DEFAULT_CLOSING.on, false)
    assert.equal(DEFAULT_CLOSING.time, "21:00")
    assert.deepEqual(readClosing(store("{bad")), DEFAULT_CLOSING)
    assert.equal(readClosing(store(JSON.stringify({ on: true, time: "25:00" }))).time, "21:00")
    assert.deepEqual(readClosing(store(JSON.stringify({ on: true, time: "19:30", spoken: "2026-11-04" }))), { on: true, time: "19:30", spoken: "2026-11-04" })
  })

  it("wired: the card on the SoundBox page, the audio the page's own; quiet phones skipped; the database counts", () => {
    const page = read("src/app/(app)/soundbox/page.tsx")
    assert.match(page, /<ClosingSummaryCard\n\s+active=\{enabled\}\n\s+quiet=\{\(\) => phoneQuiet\(\)\.then\(isQuiet\)\}/)
    const card = read("src/components/soundbox/closing-summary.tsx")
    assert.doesNotMatch(card, /from "@\/lib\/soundbox-audio"/)
    assert.match(card, /if \(await quiet\(\)\) return/)
    assert.match(card, /rpc\("soundbox_today_totals"\)/)
    assert.match(read("supabase/migrations/20270285000000_soundbox_today_totals.sql"), /security invoker/)
  })
})
