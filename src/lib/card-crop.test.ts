import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyH, CARD_H, CARD_W, cleanCorners, homography, orderCorners, sharpen, warpCard, type Quad } from "./card-crop"

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

describe("NSSF card auto-crop", () => {
  it("corners come back clockwise from top-left whatever order Vision gives", () => {
    const q = orderCorners([
      [900, 700],
      [100, 120],
      [120, 700],
      [880, 100],
    ])
    assert.deepEqual(q, [
      [100, 120],
      [880, 100],
      [900, 700],
      [120, 700],
    ])
  })
  it("a tilted card photographed on a table: accepted; a sliver, a tall shape or bad data: refused", () => {
    // 0–1000 scale on a 2000 × 1500 photo: a card covering the middle, slightly in perspective.
    const card = cleanCorners([[220, 210], [800, 180], [830, 760], [200, 790]], 2000, 1500)
    assert.ok(card)
    assert.deepEqual(card![0], [440, 315])
    assert.equal(cleanCorners([[400, 400], [450, 400], [450, 430], [400, 430]], 2000, 1500), null) // too small
    assert.equal(cleanCorners([[400, 100], [600, 100], [600, 900], [400, 900]], 1000, 1000), null) // not a card's shape
    assert.equal(cleanCorners([[0, 0], [1, 1]], 1000, 1000), null)
    assert.equal(cleanCorners("nope", 1000, 1000), null)
  })
  it("the perspective transform maps each corner exactly", () => {
    const from: Quad = [[0, 0], [CARD_W - 1, 0], [CARD_W - 1, CARD_H - 1], [0, CARD_H - 1]]
    const to: Quad = [[440, 315], [1600, 270], [1660, 1140], [400, 1185]]
    const h = homography(from, to)
    from.forEach((p, i) => {
      const [x, y] = applyH(h, p[0], p[1])
      near(x, to[i][0], 1e-6)
      near(y, to[i][1], 1e-6)
    })
  })
  it("the card comes out flat: a red card on a grey table fills the result", () => {
    const sw = 400
    const sh = 300
    const src = new Uint8ClampedArray(sw * sh * 4)
    // Grey table, a red card from (100, 75) to (300, 201) (a card's proportions).
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const inCard = x >= 100 && x <= 300 && y >= 75 && y <= 201
        src.set(inCard ? [200, 20, 20, 255] : [120, 120, 120, 255], i)
      }
    const out = warpCard(src, sw, sh, [[102, 77], [298, 77], [298, 199], [102, 199]], 100, 63)
    let red = 0
    for (let i = 0; i < out.length; i += 4) if (out[i] > 180 && out[i + 1] < 60) red++
    assert.ok(red / (100 * 63) > 0.97, `${red} of ${100 * 63} pixels are the card`)
  })
  it("sharpening keeps flat areas flat and alpha intact", () => {
    const px = new Uint8ClampedArray(5 * 5 * 4).fill(100)
    const out = sharpen(px, 5, 5)
    assert.equal(out[(2 * 5 + 2) * 4], 100)
    assert.equal(out[(2 * 5 + 2) * 4 + 3], 100)
  })
})
