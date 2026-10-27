// Facebook cover D (founder, 28/10/2026 — the banks give SoundBoxes away; what they cannot give is the whole picture):
// «ធនាគារច្រើន · បញ្ជីតែមួយ» — ABA, ACLEDA, Wing and cash flowing into the one real app. Bank names as words, no bank
// logos (no partnership is implied). 1640 × 924; desktop shows y 150–774; the bottom left stays clear.
//   node scripts/facebook-cover-d.cjs [out.png]        SCALE=2 → 3280 × 1848
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas")
const fs = require("fs")
const path = require("path")
const ROOT = path.join(__dirname, "..") + "/"
for (const w of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts", `KantumruyPro-${w}.ttf`), "Kantumruy Pro")
const S = Number(process.env.SCALE || 1)
const OUT = process.argv[2] || ROOT + `brand/facebook-cover-D-${1640 * S}x${924 * S}.png`
const W = 1640, H = 924
const c = createCanvas(W * S, H * S), g = c.getContext("2d")
g.scale(S, S)
const F = (w, px) => `${w} ${px}px 'Kantumruy Pro'`

;(async () => {
  const shot = await loadImage(ROOT + "Website/screen-business.webp")
  const logo = await loadImage(ROOT + "Website/logo.png")

  // Background, as A
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, "#032a20"); bg.addColorStop(0.55, "#05503c"); bg.addColorStop(1, "#0b6b5b")
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  for (const [x, y, r, col] of [[1330, 460, 600, "rgba(252,211,77,.20)"], [160, 880, 520, "rgba(52,211,153,.15)"]]) {
    const gr = g.createRadialGradient(x, y, 10, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)")
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
  }
  g.fillStyle = "rgba(255,255,255,.03)"
  for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) { g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill() }

  // Left: the promise
  const X = 110
  g.font = F(600, 28)
  const eb = "សម្រាប់ហាងតូច និងគ្រួសារខ្មែរ"
  g.fillStyle = "rgba(252,211,77,.16)"; g.beginPath(); g.roundRect(X, 196, g.measureText(eb).width + 48, 56, 28); g.fill()
  g.fillStyle = "#fcd34d"; g.fillText(eb, X + 24, 234)
  g.fillStyle = "#fff"; g.font = F(700, 100); g.fillText("ធនាគារច្រើន", X, 360)
  const hl = g.createLinearGradient(X, 0, X + 600, 0); hl.addColorStop(0, "#a7f3d0"); hl.addColorStop(1, "#fcd34d")
  g.fillStyle = hl; g.font = F(700, 100); g.fillText("បញ្ជីតែមួយ", X, 480)
  g.fillStyle = "#d6ebe2"; g.font = F(500, 32)
  g.fillText("លុយហាង លុយផ្ទះ បំណុល និងរំលស់", X, 552)
  g.fillText("ច្បាស់លាស់ ក្នុងអេបតែមួយ", X, 596)

  // Centre: the sources, flowing into the phone
  const PX = 1180, PY = 150, PW = 300, PH = PW * shot.height / shot.width
  const target = { x: PX - 10, y: PY + 330 }
  const sources = [
    { name: "ABA", sub: "KHQR · ធនាគារ", col: "#0e7ab8", y: 236 },
    { name: "ACLEDA", sub: "KHQR · ធនាគារ", col: "#c08a12", y: 352 },
    { name: "Wing", sub: "KHQR · វ៉ាឡេត", col: "#5f9e1a", y: 468 },
    { name: "សាច់ប្រាក់", sub: "ក្នុងថត", col: "#0f766e", y: 584 },
  ]
  const SX = 800, SW = 250
  for (const s of sources) {
    // the flow line, a soft curve to the phone
    const from = { x: SX + SW, y: s.y + 36 }
    const grad = g.createLinearGradient(from.x, 0, target.x, 0); grad.addColorStop(0, "rgba(252,211,77,.85)"); grad.addColorStop(1, "rgba(252,211,77,.15)")
    g.strokeStyle = grad; g.lineWidth = 3; g.setLineDash([2, 10]); g.lineCap = "round"
    g.beginPath(); g.moveTo(from.x, from.y); g.bezierCurveTo(from.x + 60, from.y, target.x - 60, target.y, target.x, target.y); g.stroke()
    g.setLineDash([])
    // the source chip
    g.save(); g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 24; g.shadowOffsetY = 8
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(SX, s.y, SW, 72, 20); g.fill(); g.restore()
    g.fillStyle = s.col; g.beginPath(); g.roundRect(SX + 14, s.y + 14, 44, 44, 13); g.fill()
    g.fillStyle = "#fff"; g.font = F(700, 22); g.textAlign = "center"; g.fillText(s.name === "សាច់ប្រាក់" ? "៛$" : s.name[0], SX + 36, s.y + 44); g.textAlign = "left"
    g.fillStyle = "#12261e"; g.font = F(700, 26); g.fillText(s.name, SX + 72, s.y + 36)
    g.fillStyle = "#55665e"; g.font = F(500, 18); g.fillText(s.sub, SX + 72, s.y + 60)
  }
  // the meeting point
  g.fillStyle = "#fcd34d"; g.beginPath(); g.arc(target.x, target.y, 9, 0, Math.PI * 2); g.fill()

  // Right: the one real app
  g.save(); g.translate(PX, PY); g.rotate(0.035)
  g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 70; g.shadowOffsetY = 30
  g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(-11, -11, PW + 22, PH + 22, 48); g.fill()
  g.shadowColor = "transparent"
  g.save(); g.beginPath(); g.roundRect(0, 0, PW, PH, 38); g.clip(); g.drawImage(shot, 0, 0, PW, PH); g.restore()
  g.fillStyle = "#050806"; g.beginPath(); g.roundRect(PW / 2 - 45, 11, 90, 26, 13); g.fill()
  g.restore()

  // The brand and the address, a solid pill bottom right
  const bw = 470, bh = 96, bx = W - 70 - bw, by = 670
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 30; g.shadowOffsetY = 10
  g.fillStyle = "#032a20"; g.beginPath(); g.roundRect(bx, by, bw, bh, 24); g.fill(); g.restore()
  g.strokeStyle = "rgba(252,211,77,.7)"; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 24); g.stroke()
  g.save(); g.beginPath(); g.roundRect(bx + 16, by + 14, 68, 68, 17); g.clip(); g.drawImage(logo, bx + 16, by + 14, 68, 68); g.restore()
  g.fillStyle = "#fff"; g.font = F(700, 34); g.fillText("luychlat.com", bx + 100, by + 46)
  g.fillStyle = "#fcd34d"; g.font = F(600, 21); g.fillText("អេប លុយឆ្លាត · ចាប់ផ្ដើមឥតគិតថ្លៃ", bx + 100, by + 78)

  fs.writeFileSync(OUT, c.toBuffer("image/png"))
  console.log(OUT, fs.statSync(OUT).size)
})()
