// Facebook cover D, redrawn for every screen (founder, 28/10/2026 — «on a phone it is cut»): Facebook shows the cover at
// 820 × 312 on a computer (top and bottom cropped) and 640 × 360 on a phone (the SIDES cropped), so the canvas is
// 820 × 360 (drawn at 2×: 1640 × 720) and everything that matters sits in the centre 640 × 312 that both show
// (x 180–1460, y 48–672 here). The bottom left stays clear: the Page's profile picture covers it.
//   node scripts/facebook-cover-d2.cjs [out.png]        SCALE=2 → 3280 × 1440        PREVIEW=1 → the crops side by side
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas")
const fs = require("fs")
const path = require("path")
const ROOT = path.join(__dirname, "..") + "/"
for (const w of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts", `KantumruyPro-${w}.ttf`), "Kantumruy Pro")
const W = 1640, H = 720
const SAFE = { x: 180, y: 48, w: 1280, h: 624 }
const F = (w, px) => `${w} ${px}px 'Kantumruy Pro'`

async function draw(S) {
  const c = createCanvas(W * S, H * S), g = c.getContext("2d")
  g.scale(S, S)
  const shot = await loadImage(ROOT + "Website/screen-business.webp")
  const logo = await loadImage(ROOT + "Website/logo.png")

  // Background: full bleed (the crops only ever cut background)
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, "#032a20"); bg.addColorStop(0.55, "#05503c"); bg.addColorStop(1, "#0b6b5b")
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  for (const [x, y, r, col] of [[1290, 360, 520, "rgba(252,211,77,.20)"], [300, 700, 460, "rgba(52,211,153,.14)"]]) {
    const gr = g.createRadialGradient(x, y, 10, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)")
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
  }
  g.fillStyle = "rgba(255,255,255,.03)"
  for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) { g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill() }

  // Left: the promise — high, so the profile picture (bottom left) covers nothing
  const X = 210
  g.font = F(600, 23)
  const eb = "សម្រាប់ហាងតូច និងគ្រួសារខ្មែរ"
  g.fillStyle = "rgba(252,211,77,.16)"; g.beginPath(); g.roundRect(X, 76, g.measureText(eb).width + 40, 46, 23); g.fill()
  g.fillStyle = "#fcd34d"; g.fillText(eb, X + 20, 107)
  g.fillStyle = "#fff"; g.font = F(700, 82); g.fillText("ធនាគារច្រើន", X, 215)
  const hl = g.createLinearGradient(X, 0, X + 480, 0); hl.addColorStop(0, "#a7f3d0"); hl.addColorStop(1, "#fcd34d")
  g.fillStyle = hl; g.fillText("បញ្ជីតែមួយ", X, 318)
  g.fillStyle = "#d6ebe2"; g.font = F(500, 26)
  g.fillText("លុយហាង លុយផ្ទះ បំណុល និងរំលស់", X, 372)
  g.fillText("ច្បាស់លាស់ ក្នុងអេបតែមួយ", X, 410)
  // The brand and the address, right under the promise
  const bx = X, by = 436, bw = 400, bh = 72
  g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 24; g.shadowOffsetY = 8
  g.fillStyle = "#032a20"; g.beginPath(); g.roundRect(bx, by, bw, bh, 20); g.fill(); g.restore()
  g.strokeStyle = "rgba(252,211,77,.7)"; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 20); g.stroke()
  g.save(); g.beginPath(); g.roundRect(bx + 12, by + 11, 50, 50, 13); g.clip(); g.drawImage(logo, bx + 12, by + 11, 50, 50); g.restore()
  g.fillStyle = "#fff"; g.font = F(700, 27); g.fillText("luychlat.com", bx + 76, by + 34)
  g.fillStyle = "#fcd34d"; g.font = F(600, 17); g.fillText("អេប លុយឆ្លាត · ចាប់ផ្ដើមឥតគិតថ្លៃ", bx + 76, by + 59)

  // Centre: the sources, flowing into the phone
  const PX = 1170, PY = 64, PW = 250, PH = PW * shot.height / shot.width
  const target = { x: PX - 8, y: PY + 250 }
  const SX = 800, SW = 230, CH = 64
  const sources = [
    { name: "ABA", sub: "KHQR · ធនាគារ", col: "#0e7ab8", y: 142 },
    { name: "ACLEDA", sub: "KHQR · ធនាគារ", col: "#c08a12", y: 236 },
    { name: "Wing", sub: "KHQR · វ៉ាឡេត", col: "#5f9e1a", y: 330 },
    { name: "សាច់ប្រាក់", sub: "ក្នុងថត", col: "#0f766e", y: 424 },
  ]
  for (const s of sources) {
    const from = { x: SX + SW, y: s.y + CH / 2 }
    const grad = g.createLinearGradient(from.x, 0, target.x, 0); grad.addColorStop(0, "rgba(252,211,77,.85)"); grad.addColorStop(1, "rgba(252,211,77,.15)")
    g.strokeStyle = grad; g.lineWidth = 3; g.setLineDash([2, 9]); g.lineCap = "round"
    g.beginPath(); g.moveTo(from.x, from.y); g.bezierCurveTo(from.x + 45, from.y, target.x - 45, target.y, target.x, target.y); g.stroke()
    g.setLineDash([])
    g.save(); g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 20; g.shadowOffsetY = 6
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(SX, s.y, SW, CH, 18); g.fill(); g.restore()
    g.fillStyle = s.col; g.beginPath(); g.roundRect(SX + 12, s.y + 12, 40, 40, 12); g.fill()
    g.fillStyle = "#fff"; g.font = F(700, 20); g.textAlign = "center"; g.fillText(s.name === "សាច់ប្រាក់" ? "៛$" : s.name[0], SX + 32, s.y + 39); g.textAlign = "left"
    g.fillStyle = "#12261e"; g.font = F(700, 23); g.fillText(s.name, SX + 64, s.y + 31)
    g.fillStyle = "#55665e"; g.font = F(500, 16); g.fillText(s.sub, SX + 64, s.y + 53)
  }
  g.fillStyle = "#fcd34d"; g.beginPath(); g.arc(target.x, target.y, 8, 0, Math.PI * 2); g.fill()

  // Right: the one real app
  g.save(); g.translate(PX, PY); g.rotate(0.03)
  g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 60; g.shadowOffsetY = 26
  g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(-10, -10, PW + 20, PH + 20, 42); g.fill()
  g.shadowColor = "transparent"
  g.save(); g.beginPath(); g.roundRect(0, 0, PW, PH, 33); g.clip(); g.drawImage(shot, 0, 0, PW, PH); g.restore()
  g.fillStyle = "#050806"; g.beginPath(); g.roundRect(PW / 2 - 38, 9, 76, 22, 11); g.fill()
  g.restore()
  return c
}

;(async () => {
  const S = Number(process.env.SCALE || 1)
  const c = await draw(S)
  const out = process.argv[2] || ROOT + `brand/facebook-cover-D-${W * S}x${H * S}.png`
  fs.writeFileSync(out, c.toBuffer("image/png"))
  console.log(out, fs.statSync(out).size)
  if (!process.env.PREVIEW) return
  // What a computer and a phone show, with the profile picture where Facebook puts it.
  const full = await draw(1)
  const pad = 40, gap = 50
  const desk = { x: 0, y: (H - 624) / 2, w: W, h: 624 }, phone = { x: (W - 1280) / 2, y: 0, w: 1280, h: 720 }
  const P = createCanvas(pad * 2 + desk.w, pad * 3 + 60 * 2 + desk.h + phone.h * (desk.w / phone.w) * 0.6 + gap)
  const q = P.getContext("2d")
  q.fillStyle = "#f1f5f4"; q.fillRect(0, 0, P.width, P.height)
  q.fillStyle = "#12261e"; q.font = F(700, 30)
  q.fillText("កុំព្យូទ័រ · Desktop (820 × 312)", pad, pad + 30)
  q.drawImage(full, desk.x, desk.y, desk.w, desk.h, pad, pad + 50, desk.w, desk.h)
  const avatar = (x, y, r) => { q.fillStyle = "#fff"; q.beginPath(); q.arc(x, y, r + 6, 0, Math.PI * 2); q.fill(); q.fillStyle = "#cbd5e1"; q.beginPath(); q.arc(x, y, r, 0, Math.PI * 2); q.fill() }
  avatar(pad + 150, pad + 50 + desk.h, 110)
  const py = pad * 2 + 50 + desk.h + 40
  q.fillStyle = "#12261e"; q.fillText("ទូរសព្ទ · Phone (640 × 360)", pad, py)
  const pw = desk.w * 0.6, ph = pw * phone.h / phone.w
  q.drawImage(full, phone.x, phone.y, phone.w, phone.h, pad, py + 20, pw, ph)
  avatar(pad + 120, py + 20 + ph, 80)
  const prev = out.replace(/\.png$/, "-preview.png")
  fs.writeFileSync(prev, P.toBuffer("image/png"))
  console.log(prev)
})()
