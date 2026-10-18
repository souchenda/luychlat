// The Islamic community logo (founder, 18/10/2026): the founder's own artwork — the mascot wearing a white-and-gold
// kopiah, holding the «លុយ» coin, on an emerald arch with a gold «ISLAMIC» label — public/rabbit-kopiah.png (1024 px).
//   public/logo-islamic.png 1024 × 1024 the artwork as it is: already circle-safe for the Telegram channel
//                                       (@LuyChlatIslamic) — ears, kopiah and «ISLAMIC» stay inside the circle
//   public/icon-islamic.png  512 × 512  its rounded tile only (no outer field, no label), corners transparent —
//                                       the in-app icon in the nav and the Islamic Hub while Islamic Mode is on
// Run: node scripts/generate-islamic-logo.mjs   (sharp, installed with Next.js)
import sharp from "sharp"

const SOURCE = "public/rabbit-kopiah.png"

// The tile in the 1024 px artwork (measured: x 144–880, y 77–829); a square from its top edge keeps the ears whole.
const TILE = { left: 144, top: 77, size: 737 }
const RADIUS = 0.16

await sharp(SOURCE).resize(1024, 1024, { fit: "cover" }).png({ compressionLevel: 9 }).toFile("public/logo-islamic.png")
console.log("wrote public/logo-islamic.png")

{
  const S = 512
  const r = Math.round(S * RADIUS)
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${r}" ry="${r}" fill="#fff"/></svg>`)
  await sharp(SOURCE)
    .extract({ left: TILE.left, top: TILE.top, width: TILE.size, height: TILE.size })
    .resize(S, S, { kernel: "lanczos3" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    // A palette PNG (~1/3 the size): it is shown at 36–40 px in the nav and the hub header.
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile("public/icon-islamic.png")
  console.log("wrote public/icon-islamic.png")
}
