// The Islamic community variant of the official logo (founder, 18/10/2026): the mascot logo (public/logo.png)
// itself is never redrawn or recoloured — only scaled — with a small gold-and-emerald crescent badge and, on the
// channel picture, a gold «ISLAMIC» label.
//   public/icon-islamic.png  512 × 512  the logo as it is (its rounded corners) + the crescent in the free
//                                       bottom-right corner (no ear or paw covered) — the in-app icon in Islamic Mode
//   public/logo-islamic.png 1024 × 1024 circle-safe for Telegram (@LuyChlatIslamic): the logo tile at 72 % on a deep
//                                       emerald field with a soft shadow, the crescent and «ISLAMIC» inside the circle
// Run: node scripts/generate-islamic-logo.mjs   (sharp, installed with Next.js)
// The source is 256 px, so both are upscaled — with a ≥ 1024 px master in public/logo.png, run this again.
import sharp from "sharp"

const LOGO = "public/logo.png"
const GOLD = "#d9a93a"
const GOLD_LIGHT = "#f3d27a"
const EMERALD = "#0b6b4c"

/** A crescent badge (no star): emerald disc, gold rim, a gold crescent opening to the upper right. */
const crescent = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset="1" stop-color="${GOLD}"/></linearGradient>
    <mask id="m"><rect width="100" height="100" fill="#fff"/><circle cx="60" cy="40" r="25" fill="#000"/></mask>
  </defs>
  <circle cx="50" cy="50" r="47" fill="${EMERALD}" stroke="url(#g)" stroke-width="5"/>
  <circle cx="47" cy="53" r="30" fill="url(#g)" mask="url(#m)"/>
</svg>`

/** A deep emerald field, lighter at the centre, so the logo tile reads as a deliberate card. */
const field = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><radialGradient id="f" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#14946a"/><stop offset="1" stop-color="#07513a"/></radialGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#f)"/></svg>`)

/** The tile's soft shadow: the logo's own alpha, darkened and blurred. */
const shadow = async (size) =>
  sharp(LOGO).resize(size, size, { kernel: "lanczos3" }).ensureAlpha().linear([0, 0, 0, 0.45], [0, 0, 0, 0]).blur(size * 0.03).png().toBuffer()

const logoAt = (size) => sharp(LOGO).resize(size, size, { kernel: "lanczos3" }).png().toBuffer()

// 1) The in-app icon: the logo unchanged, the badge over its top-right corner (background only — no ear covered).
{
  const S = 512
  const badge = Math.round(S * 0.2)
  const inset = Math.round(S * 0.025)
  await sharp(await logoAt(S))
    .composite([{ input: Buffer.from(crescent(badge)), top: S - badge - inset, left: S - badge - inset }])
    .png({ compressionLevel: 9 })
    .toFile("public/icon-islamic.png")
  console.log("wrote public/icon-islamic.png")
}

// 2) The channel picture: circle-safe (Telegram shows a circle of the full square).
{
  const S = 1024
  const inner = Math.round(S * 0.72)
  const top = Math.round(S * 0.075)
  const left = Math.round((S - inner) / 2)
  const badge = Math.round(S * 0.17)
  // Upper right, inside the circle: its centre at ~0.80, 0.22 of the square.
  const badgeLeft = Math.round(S * 0.8 - badge / 2)
  const badgeTop = Math.round(S * 0.22 - badge / 2)
  const label = `
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GOLD}"/><stop offset="0.5" stop-color="${GOLD_LIGHT}"/><stop offset="1" stop-color="${GOLD}"/></linearGradient></defs>
  <rect x="${S / 2 - 170}" y="${S * 0.835}" width="340" height="78" rx="39" fill="${EMERALD}" stroke="url(#t)" stroke-width="5"/>
  <text x="${S / 2}" y="${S * 0.835 + 53}" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="44" font-weight="700" letter-spacing="10" fill="url(#t)">ISLAMIC</text>
</svg>`
  await sharp(field(S))
    .composite([
      { input: await shadow(inner), top: top + Math.round(S * 0.015), left },
      { input: await logoAt(inner), top, left },
      { input: Buffer.from(crescent(badge)), top: badgeTop, left: badgeLeft },
      { input: Buffer.from(label), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile("public/logo-islamic.png")
  console.log("wrote public/logo-islamic.png")
}
