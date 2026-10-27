// Facebook cover B, redrawn (founder, 28/10/2026: «B's meaning is good, its artwork loses to A and C»).
// «លុយចូល ឮភ្លាម» — the SoundBox promise, with A's layout (the promise left, the real app right) and sound waves
// coming from the phone. 1640 × 924 (desktop shows y 150–774; the bottom left stays clear for the profile picture).
//   node scripts/facebook-cover-b2.cjs [out.png]        SCALE=2 → 3280 × 1848
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas")
const fs = require("fs")
const path = require("path")
const ROOT = path.join(__dirname, "..") + "/"
for (const w of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts", `KantumruyPro-${w}.ttf`), "Kantumruy Pro")
const S = Number(process.env.SCALE || 1)
const OUT = process.argv[2] || ROOT + `brand/facebook-cover-B-${1640 * S}x${924 * S}.png`
const W = 1640, H = 924
const c = createCanvas(W * S, H * S), g = c.getContext("2d")
g.scale(S, S)
const F = (w, px) => `${w} ${px}px 'Kantumruy Pro'`

function speaker(x, y, s, color) {
  g.fillStyle = color
  g.beginPath(); g.moveTo(x, y + 10 * s); g.lineTo(x + 10 * s, y + 10 * s); g.lineTo(x + 22 * s, y); g.lineTo(x + 22 * s, y + 36 * s); g.lineTo(x + 10 * s, y + 26 * s); g.lineTo(x, y + 26 * s); g.closePath(); g.fill()
  g.strokeStyle = color; g.lineWidth = 3 * s; g.lineCap = "round"
  for (const r of [10, 17]) { g.beginPath(); g.arc(x + 24 * s, y + 18 * s, r * s, -0.9, 0.9); g.stroke() }
}

function toast(x, y, w, amount, sub) {
  const h = 104
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 40; g.shadowOffsetY = 16
  g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x, y, w, h, 26); g.fill(); g.restore()
  g.fillStyle = "#ecfdf5"; g.beginPath(); g.roundRect(x + 20, y + 22, 60, 60, 18); g.fill()
  speaker(x + 36, y + 34, 1, "#059669")
  g.fillStyle = "#047857"; g.font = F(700, 34); g.fillText(amount, x + 98, y + 56)
  g.fillStyle = "#55665e"; g.font = F(500, 22); g.fillText(sub, x + 98, y + 86)
}

;(async () => {
  const shot = await loadImage(ROOT + "Website/screen-business.webp")
  const logo = await loadImage(ROOT + "Website/logo.png")

  // Background: A's emerald, deeper, with a gold glow where the sound starts
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, "#032a20"); bg.addColorStop(0.55, "#05503c"); bg.addColorStop(1, "#0b6b5b")
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const PX = 1250, PY = 470 // the sound's centre: the phone
  const glow = g.createRadialGradient(PX, PY, 20, PX, PY, 640)
  glow.addColorStop(0, "rgba(252,211,77,.30)"); glow.addColorStop(0.45, "rgba(52,211,153,.10)"); glow.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = glow; g.fillRect(0, 0, W, H)
  // Sound waves from the phone: bold near it, fading outwards
  for (let i = 0, r = 250; r < 1000; i++, r += 64) {
    g.strokeStyle = `rgba(252,211,77,${Math.max(0.04, 0.38 - i * 0.034)})`
    g.lineWidth = Math.max(1.5, 5 - i * 0.3)
    g.beginPath(); g.arc(PX, PY, r, 0, Math.PI * 2); g.stroke()
  }
  // fine dots, as A
  g.fillStyle = "rgba(255,255,255,.03)"
  for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) { g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill() }

  // Left: the promise
  const X = 120
  g.font = F(700, 28)
  const eb = "KHQR SoundBox"
  const ebw = g.measureText(eb).width + 104
  g.fillStyle = "rgba(252,211,77,.16)"; g.beginPath(); g.roundRect(X, 196, ebw, 58, 29); g.fill()
  speaker(X + 22, 207, 1, "#fcd34d")
  g.fillStyle = "#fcd34d"; g.fillText(eb, X + 80, 236)

  g.fillStyle = "#ffffff"; g.font = F(700, 112); g.fillText("លុយចូល", X, 370)
  const hl = g.createLinearGradient(X, 0, X + 520, 0); hl.addColorStop(0, "#a7f3d0"); hl.addColorStop(1, "#fcd34d")
  g.fillStyle = hl; g.font = F(700, 132); g.fillText("ឮភ្លាម", X, 506)

  g.fillStyle = "#d6ebe2"; g.font = F(500, 34); g.fillText("ទូរសព្ទប្រកាសជាសំឡេងខ្មែរ រាល់ពេលអតិថិជនបង់", X, 616)

  // The voice itself, as a speech bubble
  const q = "«ទទួលបាន 25,000 រៀល»"
  g.font = F(600, 32)
  const qw = g.measureText(q).width + 56
  g.fillStyle = "rgba(255,255,255,.10)"; g.beginPath(); g.roundRect(X, 648, qw, 62, 22); g.fill()
  g.beginPath(); g.moveTo(X + 30, 710); g.lineTo(X + 50, 710); g.lineTo(X + 26, 730); g.closePath(); g.fill()
  g.fillStyle = "#ffffff"; g.fillText(q, X + 28, 690)

  // Right: the real app, the two sales
  const pw = 320, ph = pw * shot.height / shot.width
  g.save(); g.translate(PX - pw / 2, 150); g.rotate(0.04)
  g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 70; g.shadowOffsetY = 30
  g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(-12, -12, pw + 24, ph + 24, 50); g.fill()
  g.shadowColor = "transparent"
  g.save(); g.beginPath(); g.roundRect(0, 0, pw, ph, 40); g.clip(); g.drawImage(shot, 0, 0, pw, ph); g.restore()
  g.fillStyle = "#050806"; g.beginPath(); g.roundRect(pw / 2 - 48, 12, 96, 27, 14); g.fill()
  g.restore()
  toast(905, 330, 390, "ទទួលបាន 25,000 ៛", "KHQR · ABA")
  toast(1190, 520, 360, "ទទួលបាន $12.50", "KHQR · ACLEDA")

  // The brand and the address, bottom right in a solid pill (as A)
  const bw = 580, bh = 104, bx = W - 70 - bw, by = 664
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 30; g.shadowOffsetY = 10
  g.fillStyle = "#032a20"; g.beginPath(); g.roundRect(bx, by, bw, bh, 26); g.fill(); g.restore()
  g.strokeStyle = "rgba(252,211,77,.7)"; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 26); g.stroke()
  g.save(); g.beginPath(); g.roundRect(bx + 18, by + 16, 72, 72, 18); g.clip(); g.drawImage(logo, bx + 18, by + 16, 72, 72); g.restore()
  g.fillStyle = "#ffffff"; g.font = F(700, 36); g.fillText("luychlat.com", bx + 108, by + 50)
  g.fillStyle = "#fcd34d"; g.font = F(600, 22); g.fillText("អេប លុយឆ្លាត · ឥតគិតថ្លៃ · Android · iPhone", bx + 108, by + 84)

  fs.writeFileSync(OUT, c.toBuffer("image/png"))
  console.log(OUT, fs.statSync(OUT).size)
})()
