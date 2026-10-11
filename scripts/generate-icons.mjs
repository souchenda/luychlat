// Generates the PWA / iOS PNG icons from the official mascot logo (public/logo.png, founder 11/10/2026).
// Run: node scripts/generate-icons.mjs   (uses sharp, installed with Next.js)
// The source is 256 px: 192 / 180 are downscaled (crisp); 512 is upscaled — replace public/logo.png
// with a ≥ 1024 px original and run this again for sharper large icons.
import { mkdir } from "node:fs/promises"

import sharp from "sharp"

const LOGO = "public/logo.png"

/**
 * The logo's own background, full bleed: for each row, its colour near the left edge (no mascot there),
 * stretched across — the exact same gradient.
 */
const backdrop = async (size) => {
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const column = Buffer.alloc(info.height * 4)
  for (let y = 0; y < info.height; y++) {
    // Inside the rounded rim; the rows above / below it take the nearest clean row (no stripes).
    const row = Math.min(Math.round(info.height * 0.88), Math.max(Math.round(info.height * 0.12), y))
    const at = (row * info.width + Math.round(info.width * 0.12)) * 4
    data.copy(column, y * 4, at, at + 3)
    column[y * 4 + 3] = 255
  }
  return sharp(column, { raw: { width: 1, height: info.height, channels: 4 } }).resize(size, size, { fit: "fill", kernel: "cubic" }).png().toBuffer()
}

/** "any": the logo as it is (its own rounded corners). */
const plain = (size) => sharp(LOGO).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 })

/** Maskable / iOS: the logo inside the safe zone on its full-bleed background (masks never cut the ears). */
const onBackdrop = async (size, scale) => {
  const inner = Math.round(size * scale)
  const logo = await sharp(LOGO).resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer()
  const at = Math.round((size - inner) / 2)
  return sharp(await backdrop(size)).composite([{ input: logo, top: at, left: at }]).png({ compressionLevel: 9 })
}

await mkdir("public/icons", { recursive: true })
const jobs = [
  ["public/icons/icon-192.png", plain(192)],
  ["public/icons/icon-512.png", plain(512)],
  ["public/icons/maskable-512.png", await onBackdrop(512, 0.8)],
  ["public/icons/apple-touch-icon.png", await onBackdrop(180, 0.92)],
]
for (const [file, img] of jobs) {
  await img.toFile(file)
  console.log("wrote", file)
}
