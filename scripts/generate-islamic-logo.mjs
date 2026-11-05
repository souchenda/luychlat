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
  <circle cx="512" cy="512" r="430" fill="none" stroke="${GOLD}" stroke-opacity=".35" stroke-width="6"/>
  <!-- crescent and star -->
  <circle cx="498" cy="262" r="62" fill="${GOLD}"/>
  <circle cx="524" cy="248" r="54" fill="${EMERALD}"/>
  ${star(530, 256, 22)}
  <!-- finial -->
  <rect x="505" y="322" width="14" height="54" rx="7" fill="${WHITE}"/>
  <!-- the onion dome -->
  <path d="M512 372 C528 412 626 452 668 528 C704 594 690 660 664 694 L360 694 C334 660 320 594 356 528 C398 452 496 412 512 372 Z" fill="${WHITE}"/>
  <!-- the drum and its base -->
  <rect x="334" y="712" width="356" height="62" rx="14" fill="${WHITE}"/>
  <rect x="300" y="792" width="424" height="40" rx="12" fill="${WHITE}" fill-opacity=".9"/>
</svg>`

if (process.argv[1] && import.meta.url.endsWith("generate-islamic-logo.mjs")) {
  const svg = Buffer.from(LOGO_SVG)
  await sharp(svg).png({ compressionLevel: 9 }).toFile("public/logo-islamic.png")
  for (const out of ["public/icon-islamic.png", "Website/logo-islamic.png"])
    await sharp(svg).resize(512, 512).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out)
  console.log("wrote public/logo-islamic.png, public/icon-islamic.png, Website/logo-islamic.png")
}
