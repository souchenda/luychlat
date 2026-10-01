// Generates the PWA / iOS PNG icons from the brand mark.
// Run: node scripts/generate-icons.mjs   (uses sharp, installed with Next.js)
import { mkdir } from "node:fs/promises"

import sharp from "sharp"

const GREEN = "#0f9f6e"
const FONT = "Kantumruy Pro, Khmer UI, Khmer OS, Leelawadee UI, Noto Sans Khmer, sans-serif"

/** Rounded app icon ("any" purpose). */
const roundedSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${GREEN}"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="20"/>
  <text x="256" y="262" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="210" font-weight="700" fill="#ffffff">៛</text>
</svg>`

/** Maskable: full-bleed background, artwork inside the 80% safe zone. */
const maskableSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${GREEN}"/>
  <circle cx="256" cy="256" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="16"/>
  <text x="256" y="261" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="165" font-weight="700" fill="#ffffff">៛</text>
</svg>`

/** iOS applies its own corner mask, so the apple-touch-icon is a full square. */
const appleSvg = (size) => maskableSvg(size).replace('stroke-width="16"', 'stroke-width="18"')

await mkdir("public/icons", { recursive: true })
const jobs = [
  ["public/icons/icon-192.png", roundedSvg(192)],
  ["public/icons/icon-512.png", roundedSvg(512)],
  ["public/icons/maskable-512.png", maskableSvg(512)],
  ["public/icons/apple-touch-icon.png", appleSvg(180)],
]
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(file)
  console.log("wrote", file)
}
