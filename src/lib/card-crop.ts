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
// The straightened card at full resolution (≈ 480 dpi): every letter stays legible when zoomed.
export const CARD_W = 2024
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

/** Four points on the 0–1000 scale → pixels, read as [x, y] or as Gemini's own [y, x]. */
function toPixels(raw: unknown, width: number, height: number, yFirst: boolean): Pt[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const pts: Pt[] = []
  for (const p of raw) {
    const pair = Array.isArray(p) && p.length === 2 ? p.map(Number) : p && typeof p === "object" ? [Number((p as { x?: unknown }).x), Number((p as { y?: unknown }).y)] : null
    if (!pair) return null
    const [a, b] = pair
    const [x, y] = yFirst && Array.isArray(p) ? [b, a] : [a, b]
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -20 || x > 1020 || y < -20 || y > 1020) return null
    pts.push([(Math.min(1000, Math.max(0, x)) / 1000) * width, (Math.min(1000, Math.max(0, y)) / 1000) * height])
  }
  return pts
}

/** A clear card shape: convex, at least 8% of the photo, a card's proportions — landscape, or sideways (then turned). */
function asCard(pts: Pt[], width: number, height: number): { q: Quad; sideways: boolean } | null {
  const q = orderCorners(pts)
  if (!convex(q) || area(q) < 0.08 * width * height) return null
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2
  const ratio = w / h
  if (ratio >= CARD_RATIO * 0.75 && ratio <= CARD_RATIO * 1.25) return { q, sideways: false }
  // Photographed sideways: start at the next corner so the long edge is the top.
  if (1 / ratio >= CARD_RATIO * 0.75 && 1 / ratio <= CARD_RATIO * 1.25) return { q: [q[3], q[0], q[1], q[2]], sideways: true }
  return null
}

/** How much of the quad's bounding rectangle lies inside the box (0–1). */
function overlap(q: Quad, b: Box): number {
  const xs = q.map((p) => p[0])
  const ys = q.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const ix = Math.max(0, Math.min(x1, b.x + b.w) - Math.max(x0, b.x))
  const iy = Math.max(0, Math.min(y1, b.y + b.h) - Math.max(y0, b.y))
  const union = (x1 - x0) * (y1 - y0) + b.w * b.h - ix * iy
  return union > 0 ? (ix * iy) / union : 0
}

/**
 * Vision's corners (4 points on a 0–1000 scale of the image) → pixel corners, or null when they
 * don't describe a card clearly in the photo. Gemini writes points as [y, x]; others [x, y] — both
 * readings are tried. When both make a card shape, the one matching the bounding box wins (else
 * the landscape one); with a box, corners that don't match it at all are not trusted.
 */
export function cleanCorners(raw: unknown, width: number, height: number, box?: Box | null): Quad | null {
  const found = [true, false]
    .map((yFirst) => {
      const pts = toPixels(raw, width, height, yFirst)
      return pts ? asCard(pts, width, height) : null
    })
    .filter((c): c is { q: Quad; sideways: boolean } => c !== null)
  if (!found.length) return null
  if (box) {
    const scored = found.map((c) => ({ c, s: overlap(c.q, box) })).sort((a, b) => b.s - a.s)
    return scored[0].s >= 0.5 ? scored[0].c.q : null
  }
  return (found.find((c) => !c.sideways) ?? found[0]).q
}

export type Box = { x: number; y: number; w: number; h: number }

/**
 * A photo that is itself card-shaped (within 12%, either way up) with no edges found inside it is
 * already just the card — e.g. cropped on the phone: it is kept as it is, not refused.
 */
export function isCardFrame(width: number, height: number): boolean {
  const r = width / height
  const near = (x: number) => x >= CARD_RATIO * 0.88 && x <= CARD_RATIO * 1.12
  return near(r) || near(1 / r)
}

/**
 * Gemini's box_2d [ymin, xmin, ymax, xmax] (0–1000) → a pixel rectangle, or null when it isn't a
 * plausible card area (≥ 8% of the photo). The fallback when the corners aren't certain: a plain
 * rectangular crop to the card's outer edges — never the whole photo with the table.
 */
export function cleanBox(raw: unknown, width: number, height: number, inset = 0.02): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [ymin, xmin, ymax, xmax] = raw.map(Number)
  if (![ymin, xmin, ymax, xmax].every((v) => Number.isFinite(v) && v >= -20 && v <= 1020)) return null
  const c = (v: number) => Math.min(1000, Math.max(0, v)) / 1000
  const x = Math.round(c(xmin) * width)
  const y = Math.round(c(ymin) * height)
  const w = Math.round(c(xmax) * width) - x
  const h = Math.round(c(ymax) * height) - y
  if (w <= 0 || h <= 0 || w * h < 0.08 * width * height) return null
  // Tightened inward on every side (2% by default): no sliver of table at the edges or corners.
  const dx = Math.round(w * inset)
  const dy = Math.round(h * inset)
  return { x: x + dx, y: y + dy, w: w - 2 * dx, h: h - 2 * dy }
}

/** The rectangle cut out of the photo's pixels. */
export function cropBox(src: Uint8ClampedArray, sw: number, box: Box): Uint8ClampedArray {
  const out = new Uint8ClampedArray(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) out.set(src.subarray(((box.y + y) * sw + box.x) * 4, ((box.y + y) * sw + box.x + box.w) * 4), y * box.w * 4)
  return out
}

/**
 * Moves each corner by `by` of the way from the centre: negative trims inward. The default trims
 * 0.4% so not a hair of the table stays on the card (founder, 09/10: the card only).
 */
export function loosen(q: Quad, width: number, height: number, by = -0.004): Quad {
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

/**
 * The card found on the phone itself, without Vision (when it is busy): the background's colour
 * is read from the photo's border, and the card is the large region that differs from it — a card
 * on a table, a desk or a bed sheet. Returns its box (tightened like Vision's), or null when no
 * single card-shaped region stands out. Works on a ≤ 400 px sample, so it is quick.
 */
export function localCardBox(px: Uint8ClampedArray, width: number, height: number, inset = 0.02): Box | null {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 400))
  const cols = Math.floor(width / step)
  const rows = Math.floor(height / step)
  if (cols < 20 || rows < 20) return null
  const at = (cx: number, cy: number) => ((cy * step) * width + cx * step) * 4
  // The background: the median colour of the outer 4% frame.
  const frame: number[][] = []
  const edge = Math.max(1, Math.round(Math.min(cols, rows) * 0.04))
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++)
      if (cx < edge || cy < edge || cx >= cols - edge || cy >= rows - edge) {
        const i = at(cx, cy)
        frame.push([px[i], px[i + 1], px[i + 2]])
      }
  const median = (k: number) => frame.map((c) => c[k]).sort((a, b) => a - b)[frame.length >> 1]
  const bg = [median(0), median(1), median(2)]
  // How far each sample is from the background, and a threshold above the frame's own spread.
  const far = (i: number) => Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2])
  const spread = frame.map((c) => Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2])).sort((a, b) => a - b)[Math.floor(frame.length * 0.9)]
  const threshold = Math.max(45, spread * 1.5)
  const colCount = new Array<number>(cols).fill(0)
  const rowCount = new Array<number>(rows).fill(0)
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++)
      if (far(at(cx, cy)) > threshold) {
        colCount[cx]++
        rowCount[cy]++
      }
  // The card's span: the longest run of columns / rows well covered by "not background".
  const span = (counts: number[], other: number): [number, number] | null => {
    const need = other * 0.25
    let best: [number, number] | null = null
    let start = -1
    for (let i = 0; i <= counts.length; i++) {
      if (i < counts.length && counts[i] >= need) {
        if (start < 0) start = i
      } else if (start >= 0) {
        if (!best || i - start > best[1] - best[0]) best = [start, i]
        start = -1
      }
    }
    return best
  }
  const xs = span(colCount, rows)
  const ys = span(rowCount, cols)
  if (!xs || !ys) return null
  const box = { x: xs[0] * step, y: ys[0] * step, w: (xs[1] - xs[0]) * step, h: (ys[1] - ys[0]) * step }
  if (box.w * box.h < 0.08 * width * height || box.w * box.h > 0.97 * width * height) return null
  const ratio = box.w / box.h
  const cardish = (r: number) => r >= CARD_RATIO * 0.7 && r <= CARD_RATIO * 1.3
  if (!cardish(ratio) && !cardish(1 / ratio)) return null
  const dx = Math.round(box.w * inset)
  const dy = Math.round(box.h * inset)
  return { x: box.x + dx, y: box.y + dy, w: box.w - 2 * dx, h: box.h - 2 * dy }
}
