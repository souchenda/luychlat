// The Islamic community logo (founder, 5/11/2026 — replaces the kopiah mascot of 18/10/2026 everywhere): a white mosque
// dome on the brand's deep emerald, crescent and star in the brand's gold above it — drawn here, our own artwork (the
// founder showed a dome icon as the style he wants; we do not copy another app's mark). One drawing, three files:
//   public/logo-islamic.png   1024 × 1024  the Telegram channel (@LuyChlatIslamic) — everything inside the circle Telegram cuts
//   public/icon-islamic.png    512 × 512   the in-app mark while Islamic Mode is on, the Islamic posters' and reels' header
//   Website/logo-islamic.png   512 × 512   the Islamic page on luychlat.com
// Run: node scripts/generate-islamic-logo.mjs   (sharp, installed with Next.js)
import sharp from "sharp"

const EMERALD = "#064e3b"
const GOLD = "#e2b55a"
const WHITE = "#ffffff"

// A five-pointed star centred on (cx, cy), outer radius r.
const star = (cx, cy, r) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.42 : r
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`)
  }
  return `<polygon points="${pts.join(" ")}" fill="${GOLD}"/>`
}

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${EMERALD}"/>
  <g transform="translate(0 24)">
  <!-- bold and simple (founder, 5/11/2026): a large round dome on one base, the crescent and star on a short finial -->
  <circle cx="500" cy="246" r="56" fill="${GOLD}"/>
  <circle cx="523" cy="233" r="48" fill="${EMERALD}"/>
  ${star(530, 244, 19)}
  <rect x="506" y="300" width="12" height="28" rx="6" fill="${WHITE}"/>
  <path d="M330 692 C258 598 290 418 452 370 C492 358 508 346 512 330 C516 346 532 358 572 370 C734 418 766 598 694 692 Z" fill="${WHITE}"/>
  <rect x="296" y="710" width="432" height="72" rx="22" fill="${WHITE}"/>
  </g>
</svg>`

if (process.argv[1] && import.meta.url.endsWith("generate-islamic-logo.mjs")) {
  const svg = Buffer.from(LOGO_SVG)
  await sharp(svg).png({ compressionLevel: 9 }).toFile("public/logo-islamic.png")
  for (const out of ["public/icon-islamic.png", "Website/logo-islamic.png"])
    await sharp(svg).resize(512, 512).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out)
  console.log("wrote public/logo-islamic.png, public/icon-islamic.png, Website/logo-islamic.png")
}
