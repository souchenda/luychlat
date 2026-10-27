// The Facebook Page cover for facebook.com/appluychlat — 1640 × 924 (Facebook's size). Desktop shows the middle
// 1640 × 624 (y 150–774), phones show it all: everything that matters stays inside y 170–760.
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas")
const fs = require("fs")
const path = require("path")
const ROOT = "D:/CODE/SmartLuy/"
const OUT = process.argv[2] || ROOT + "brand/facebook-cover-1640x924.png"
for (const w of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts", `KantumruyPro-${w}.ttf`), "Kantumruy Pro")

const W = 1640, H = 924
// SCALE=2 draws the same cover at 3280 × 1848 (text and shapes are vectors, so it stays sharp on retina screens).
const S = Number(process.env.SCALE || 1)
const c = createCanvas(W * S, H * S), g = c.getContext("2d")
g.scale(S, S)

// Background: deep emerald to teal, with soft gold and mint glows
const bg = g.createLinearGradient(0, 0, W, H)
bg.addColorStop(0, "#053b2e"); bg.addColorStop(0.5, "#065f46"); bg.addColorStop(1, "#0f766e")
g.fillStyle = bg; g.fillRect(0, 0, W, H)
for (const [x, y, r, col] of [[1350, 120, 620, "rgba(252,211,77,.20)"], [180, 900, 560, "rgba(52,211,153,.18)"], [900, 480, 420, "rgba(255,255,255,.05)"]]) {
  const gr = g.createRadialGradient(x, y, 10, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
}
// fine dotted texture
g.fillStyle = "rgba(255,255,255,.035)"
for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill() }

const X = 120
// Eyebrow pill
g.font = "600 30px 'Kantumruy Pro'"
const eb = "សម្រាប់ហាងតូច និងគ្រួសារខ្មែរ"
const ebw = g.measureText(eb).width + 48
g.fillStyle = "rgba(252,211,77,.16)"; g.beginPath(); g.roundRect(X, 200, ebw, 56, 28); g.fill()
g.fillStyle = "#fcd34d"; g.fillText(eb, X + 24, 238)

// Headline
g.fillStyle = "#ffffff"; g.font = "700 92px 'Kantumruy Pro'"; g.fillText("លុយហាង និងលុយផ្ទះ", X, 372)
const hl = g.createLinearGradient(X, 0, X + 820, 0); hl.addColorStop(0, "#a7f3d0"); hl.addColorStop(1, "#fcd34d")
g.fillStyle = hl; g.fillText("ច្បាស់លាស់ ក្នុងដៃតែមួយ", X, 488)

// Three signature lines, each with a drawn icon tile
const sig = [
  ["🔊", "ឮភ្លាម ពេលលុយចូល KHQR"],
  ["🎤", "និយាយខ្មែរ ក៏កត់បាន"],
  ["🔒", "លុយហាង មិនលាយលុយផ្ទះ"],
]
let y = 560
for (const [, text] of sig) {
  g.fillStyle = "rgba(255,255,255,.10)"; g.beginPath(); g.roundRect(X, y, 56, 56, 16); g.fill()
  g.strokeStyle = "#fcd34d"; g.lineWidth = 3.5; g.beginPath(); g.moveTo(X + 17, y + 29); g.lineTo(X + 26, y + 38); g.lineTo(X + 41, y + 19); g.stroke()
  g.fillStyle = "#e8f5ef"; g.font = "500 34px 'Kantumruy Pro'"; g.fillText(text, X + 76, y + 40)
  y += 72
}

;(async () => {
  // The phone with the real app (anonymized screenshot) and the SoundBox sale
  const shot = await loadImage(ROOT + "Website/screen-business.webp")
  const pw = 330, ph = pw * shot.height / shot.width
  const px = 1160, py = 120
  g.save(); g.translate(px, py); g.rotate(0.05)
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 60; g.shadowOffsetY = 30
  g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(-12, -12, pw + 24, ph + 24, 52); g.fill()
  g.shadowColor = "transparent"
  g.save(); g.beginPath(); g.roundRect(0, 0, pw, ph, 42); g.clip(); g.drawImage(shot, 0, 0, pw, ph); g.restore()
  g.fillStyle = "#050806"; g.beginPath(); g.roundRect(pw / 2 - 50, 12, 100, 28, 14); g.fill()
  g.restore()

  // The sale notification, floating over the phone
  const tx = 1000, ty = 500, tw = 400, th = 104
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 40; g.shadowOffsetY = 16
  g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(tx, ty, tw, th, 26); g.fill(); g.restore()
  g.fillStyle = "#ecfdf5"; g.beginPath(); g.roundRect(tx + 20, ty + 22, 60, 60, 18); g.fill()
  // a small speaker drawn
  g.fillStyle = "#059669"; g.beginPath(); g.moveTo(tx + 36, ty + 44); g.lineTo(tx + 46, ty + 44); g.lineTo(tx + 58, ty + 34); g.lineTo(tx + 58, ty + 70); g.lineTo(tx + 46, ty + 60); g.lineTo(tx + 36, ty + 60); g.closePath(); g.fill()
  g.strokeStyle = "#059669"; g.lineWidth = 3; g.beginPath(); g.arc(tx + 60, ty + 52, 10, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(tx + 60, ty + 52, 17, -0.9, 0.9); g.stroke()
  g.fillStyle = "#047857"; g.font = "700 34px 'Kantumruy Pro'"; g.fillText("ទទួលបាន 25,000 ៛", tx + 98, ty + 56)
  g.fillStyle = "#55665e"; g.font = "500 22px 'Kantumruy Pro'"; g.fillText("KHQR · SoundBox", tx + 98, ty + 86)

  // Address and the free promise: a solid pill, bottom right (readable over the phone; clear of the profile picture)
  const bw = 470, bh = 104, bx = W - 100 - bw, by = 664
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 30; g.shadowOffsetY = 10
  g.fillStyle = "#053b2e"; g.beginPath(); g.roundRect(bx, by, bw, bh, 26); g.fill(); g.restore()
  g.strokeStyle = "rgba(252,211,77,.7)"; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 26); g.stroke()
  g.textAlign = "center"
  g.fillStyle = "#ffffff"; g.font = "700 40px 'Kantumruy Pro'"; g.fillText("luychlat.com", bx + bw / 2, by + 50)
  g.fillStyle = "#fcd34d"; g.font = "600 23px 'Kantumruy Pro'"; g.fillText("ឥតគិតថ្លៃ · Android · iPhone · Telegram", bx + bw / 2, by + 86)
  g.textAlign = "left"

  fs.writeFileSync(OUT, c.toBuffer("image/png"))
  console.log(OUT, fs.statSync(OUT).size)
})()
