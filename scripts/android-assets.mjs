// Android launcher icons and splash images from the web app icons (public/icons).
// Run after `npx cap add android`, or whenever the icon changes:
//   node scripts/android-assets.mjs
import { mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

import sharp from "sharp"

const RES = "android/app/src/main/res"
const ICON = "public/icons/icon-512.png" // rounded square, transparent corners
const MASKABLE = "public/icons/maskable-512.png" // full-bleed, content in the central 80 %
const BACKGROUND = "#0F9F6E" // the maskable icon's own background

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const circle = (size) => Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`)

for (const [name, scale] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${name}`)
  mkdirSync(dir, { recursive: true })
  const legacy = Math.round(48 * scale)
  const adaptive = Math.round(108 * scale)

  await sharp(ICON).resize(legacy, legacy).png().toFile(join(dir, "ic_launcher.png"))
  await sharp(MASKABLE)
    .resize(legacy, legacy)
    .composite([{ input: circle(legacy), blend: "dest-in" }])
    .png()
    .toFile(join(dir, "ic_launcher_round.png"))

  // Adaptive foreground: launchers show the central ~61 % (66 of 108 dp), the
  // maskable icon keeps its artwork in the central 80 % → scale it to 76 %.
  const inner = Math.round(adaptive * 0.76)
  const pad = Math.floor((adaptive - inner) / 2)
  await sharp(MASKABLE)
    .resize(inner, inner)
    .extend({ top: pad, left: pad, bottom: adaptive - inner - pad, right: adaptive - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(dir, "ic_launcher_foreground.png"))
}

// Splash (shown while the app starts): white with the icon in the middle, every size Capacitor generated.
const splashDirs = readdirSync(RES).filter((d) => d === "drawable" || d.startsWith("drawable-land-") || d.startsWith("drawable-port-"))
for (const d of splashDirs) {
  const file = join(RES, d, "splash.png")
  const { width, height } = await sharp(file).metadata()
  const logo = Math.round(Math.min(width, height) * 0.28)
  const mark = await sharp(ICON).resize(logo, logo).png().toBuffer()
  const out = await sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer()
  await sharp(out).toFile(file)
}

console.log(`icons: ${Object.keys(DENSITIES).length} densities · splash: ${splashDirs.length} images`)
