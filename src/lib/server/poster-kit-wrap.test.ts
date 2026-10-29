import assert from "node:assert/strict"
import { createCanvas } from "@napi-rs/canvas"
import { describe, it } from "node:test"

import { FAMILIES, FRAME, loadFonts, ORPHAN_SHARE, wrap } from "./poster-kit"

// Regression (29/10/2026): the day-back poster read «សូមស្វាគមន៍មកកាន់ការពិត» / «វិញ» — one word alone on the headline's
// last line (founder: «if I hadn't looked closely it would have damaged our brand»). Every poster wraps through wrap().
describe("poster lines never leave a lone word on the last line", () => {
  loadFonts()
  const ctx = createCanvas(FRAME.W, FRAME.H).getContext("2d")
  const W = FRAME.W - 2 * FRAME.PAD - 260 // the holiday poster's headline box

  it("the day-back headline that went out for approval now breaks evenly", () => {
    ctx.font = `700 66px ${FAMILIES}`
    const lines = wrap(ctx, "សូមស្វាគមន៍មកកាន់ការពិតវិញ", W, 3)
    assert.equal(lines.length, 2, lines.join(" / "))
    assert.notEqual(lines[1], "វិញ")
    assert.deepEqual(lines, ["សូមស្វាគមន៍មកកាន់", "ការពិតវិញ"])
  })

  it("headlines and body lines of every length: the last line is never a short stub when it could be balanced", () => {
    const samples = [
      "ថ្ងៃឈប់សម្រាកចប់ហើយ — តែវិក្កយបត្រមិនបានឈប់សម្រាកជាមួយយើងទេ។",
      "ពិនិត្យសមតុល្យ មើលវិក្កយបត្រជិតដល់ថ្ងៃ ហើយចាប់ផ្តើមកត់ត្រាឡើងវិញ។",
      "ស្អែកចាប់ផ្តើមថ្ងៃឈប់សម្រាក កំណត់ថវិកាដើរលេងឱ្យច្បាស់មុនចេញ",
      "Plan the holiday budget before you leave, and keep to it all week",
    ]
    for (const size of [40, 66, 86]) {
      ctx.font = `700 ${size}px ${FAMILIES}`
      for (const text of samples) {
        const lines = wrap(ctx, text, W, 6)
        if (lines.length < 2) continue
        const last = ctx.measureText(lines.at(-1)!).width
        const above = ctx.measureText(lines.at(-2)!).width
        // Short only when nothing more could come down (the line above would end up shorter than this one).
        assert.ok(last >= W * ORPHAN_SHARE || above <= last * 2.5, `${size}px: ${lines.join(" / ")}`)
      }
    }
  })

  it("a text that fits one line stays one line; nothing is lost", () => {
    ctx.font = `700 66px ${FAMILIES}`
    assert.deepEqual(wrap(ctx, "ត្រឡប់មកធ្វើការវិញហើយ", W, 3), ["ត្រឡប់មកធ្វើការវិញហើយ"])
    const text = "ថ្ងៃឈប់សម្រាកចប់ហើយ — តែវិក្កយបត្រមិនបានឈប់សម្រាកជាមួយយើងទេ។"
    assert.equal(wrap(ctx, text, W, 6).join("").replace(/\s/g, ""), text.replace(/\s/g, ""))
  })
})
