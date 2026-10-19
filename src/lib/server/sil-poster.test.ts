import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { silPosterContent } from "@/lib/sil-poster"

import { renderSilPoster, SIL_FRAME, SIL_POSTER, silPosterReady } from "./sil-poster"

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
    const src = readFileSync(join(process.cwd(), "src/lib/server/sil-poster.ts"), "utf8")
    const titleBaseline = Number(/ctx\.fillText\(c\.title, W \/ 2, (\d+)\)/.exec(src)![1])
    const blessingTop = Number(/lines\.forEach\(\(l, i\) => ctx\.fillText\(l, W \/ 2, (\d+) \+/.exec(src)![1]) - 34
    assert.ok(titleBaseline + 20 <= SIL_FRAME.top, `title ${titleBaseline} / frame ${SIL_FRAME.top}`)
    assert.ok(SIL_FRAME.bottom <= blessingTop, `frame ${SIL_FRAME.bottom} / blessing ${blessingTop}`)
    assert.match(src, /Math\.min\(SIL_FRAME\.maxWidth \/ art\.bg\.width, boxH \/ art\.bg\.height\)/) // contained, never cropped
    assert.equal(SIL_POSTER.background, "public/images/buddhist_sil_day_bg.jpg")
  })
})
