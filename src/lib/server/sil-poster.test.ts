import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { silPosterContent } from "@/lib/sil-poster"

import { renderSilPoster, SIL_FRAME, SIL_LAYOUT, SIL_POSTER, silPosterReady } from "./sil-poster"

describe("The Sil day poster — drawn", () => {
  before(() => silPosterReady)
  it("a 1080 × 1350 PNG on each Sil day (the drawn lotus until the founder's photograph is in place)", () => {
    for (const day of ["2026-10-19", "2026-10-26", "2026-11-03", "2026-11-09"]) {
      const png = renderSilPoster(silPosterContent(day)!)
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", day)
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [SIL_POSTER.W, SIL_POSTER.H], day)
    }
  })
  it("the photograph sits whole in its frame, between the title and the blessing — never a word over the Buddha image", () => {
    assert.ok(SIL_LAYOUT.title + 30 <= SIL_FRAME.top, `title ${SIL_LAYOUT.title} / frame ${SIL_FRAME.top}`)
    assert.ok(SIL_FRAME.bottom <= SIL_LAYOUT.blessing - SIL_LAYOUT.blessingSize, `frame ${SIL_FRAME.bottom} / blessing ${SIL_LAYOUT.blessing}`)
    const src = readFileSync(join(process.cwd(), "src/lib/server/sil-poster.ts"), "utf8")
    assert.match(src, /Math\.min\(SIL_FRAME\.maxWidth \/ art\.bg\.width, boxH \/ art\.bg\.height\)/) // contained, never cropped
    assert.equal(SIL_POSTER.background, "public/images/buddhist_sil_day_bg.jpg")
  })
  it("no clipping or overflow on any Sil day: the date block clear of the brand, each line within the poster", async () => {
    const { createCanvas } = await import("@napi-rs/canvas")
    const { FAMILIES, loadFonts } = await import("./poster-kit")
    loadFonts()
    const ctx = createCanvas(10, 10).getContext("2d")
    const width = (text: string, font: string) => {
      ctx.font = `${font} ${FAMILIES}`
      return ctx.measureText(text).width
    }
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10)
      const c = silPosterContent(day)
      if (!c) continue
      // The date block: at 22 px at the smallest, beside a brand ending at x ≈ 426 (70 + 84 + 22 + 250).
      assert.ok(Math.max(...c.dateLines.map((l) => width(l, "600 22px"))) + 36 <= SIL_POSTER.W - 70 - 426, day)
      for (const l of c.blessingLines) assert.ok(width(l, `500 ${SIL_LAYOUT.blessingSize}px`) <= SIL_POSTER.W - 120, l)
      assert.ok(width(c.title, `800 ${SIL_LAYOUT.titleSize}px`) <= SIL_POSTER.W - 80)
      assert.ok(width(c.cta, "500 24px") <= SIL_POSTER.W - 160)
    }
    assert.ok(SIL_LAYOUT.blessing + Math.round(SIL_LAYOUT.blessingSize * 1.65) + 14 <= SIL_LAYOUT.divider) // the second line clears the rule
  })
})
