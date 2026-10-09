/**
 * A photo of a card on a table → just the card, straight and crisp. Vision gives
 * the card's 4 corners; here they are checked, the card is mapped onto a flat
 * rectangle (perspective correction) and lightly sharpened. Pure — works on
 * RGBA pixel arrays, so the browser's canvas only reads and writes them
 * (card-crop.test.ts).
 */

export type Pt = [number, number]
export type Quad = [Pt, Pt, Pt, Pt]

/** An ID-1 card (NSSF, national ID): 85.6 × 54 mm. */
export const CARD_RATIO = 85.6 / 54
export const CARD_W = 1012
export const CARD_H = Math.round(CARD_W / CARD_RATIO)

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Polygon area (shoelace), any orientation. */
function area(q: Pt[]): number {
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i]
    const [x2, y2] = q[(i + 1) % q.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

/** Clockwise from top-left (in image coordinates, y down): TL, TR, BR, BL. */
export function orderCorners(points: Pt[]): Quad {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length
  const sorted = [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
  // atan2 order with y down is clockwise on screen; start at the corner nearest the top-left.
  const start = sorted.reduce((best, p, i) => (p[0] + p[1] < sorted[best][0] + sorted[best][1] ? i : best), 0)
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad
}

function convex(q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-9) return false
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

/**
 * Vision's corners ([[x, y] × 4] on a 0–1000 scale of the image) → pixel corners, or null
 * when they don't describe a card clearly in the photo: all inside the image, a convex
 * shape covering at least 8% of it, with a card's proportions (landscape, ±25%).
 */
export function cleanCorners(raw: unknown, width: number, height: number): Quad | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const pts: Pt[] = []
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return null
    const [x, y] = p.map(Number)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -20 || x > 1020 || y < -20 || y > 1020) return null
    pts.push([(Math.min(1000, Math.max(0, x)) / 1000) * width, (Math.min(1000, Math.max(0, y)) / 1000) * height])
  }
  const q = orderCorners(pts)
  if (!convex(q)) return null
  if (area(q) < 0.08 * width * height) return null
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2
  const ratio = w / h
  if (ratio < CARD_RATIO * 0.75 || ratio > CARD_RATIO * 1.25) return null
  return q
}

/** Pushes each corner ~0.8% away from the centre: a slightly loose crop never cuts the card's edge. */
export function loosen(q: Quad, width: number, height: number, by = 0.008): Quad {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4
  const cy = q.reduce((s, p) => s + p[1], 0) / 4
  return q.map(([x, y]) => [Math.min(width - 1, Math.max(0, x + (x - cx) * by * 2)), Math.min(height - 1, Math.max(0, y + (y - cy) * by * 2))]) as Quad
}

/** The 3×3 perspective transform taking each `from` corner to the matching `to` corner. */
export function homography(from: Quad, to: Quad): number[] {
  // Solve the 8 unknowns h0..h7 (h8 = 1): x' = (h0 x + h1 y + h2) / (h6 x + h7 y + 1), likewise y'.
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]
    const [u, v] = to[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    ;[A[col], A[pivot]] = [A[pivot], A[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const f = A[r][col] / A[col][col]
      for (let c = col; c < 8; c++) A[r][c] -= f * A[col][c]
      b[r] -= f * b[col]
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1]
}

export const applyH = (h: number[], x: number, y: number): Pt => {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

/** The card, flat: each output pixel is sampled (bilinear) from where it lies on the photo. */
export function warpCard(src: Uint8ClampedArray, sw: number, sh: number, quad: Quad, ow = CARD_W, oh = CARD_H): Uint8ClampedArray {
  const rect: Quad = [
    [0, 0],
    [ow - 1, 0],
    [ow - 1, oh - 1],
    [0, oh - 1],
  ]
  const h = homography(rect, quad) // output → photo
  const out = new Uint8ClampedArray(ow * oh * 4)
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const [fx, fy] = applyH(h, x, y)
      const x0 = Math.min(sw - 2, Math.max(0, Math.floor(fx)))
      const y0 = Math.min(sh - 2, Math.max(0, Math.floor(fy)))
      const dx = Math.min(1, Math.max(0, fx - x0))
      const dy = Math.min(1, Math.max(0, fy - y0))
      const o = (y * ow + x) * 4
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c]
        const p10 = src[(y0 * sw + x0 + 1) * 4 + c]
        const p01 = src[((y0 + 1) * sw + x0) * 4 + c]
        const p11 = src[((y0 + 1) * sw + x0 + 1) * 4 + c]
        out[o + c] = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy
      }
    }
  }
  return out
}

/** A light unsharp mask (3×3): crisper print, no halos. Alpha untouched. */
export function sharpen(px: Uint8ClampedArray, w: number, h: number, amount = 0.35): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const blur =
          (px[i - 4 + c] + px[i + 4 + c] + px[i - w * 4 + c] + px[i + w * 4 + c] + px[i - w * 4 - 4 + c] + px[i - w * 4 + 4 + c] + px[i + w * 4 - 4 + c] + px[i + w * 4 + 4 + c] + px[i + c]) / 9
        out[i + c] = px[i + c] + amount * (px[i + c] - blur)
      }
    }
  }
  return out
}
