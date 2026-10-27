// Two more Facebook covers to choose from (1640 × 924; desktop shows y 150–774). VARIANT=B or C, SCALE=1|2.
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas")
const fs = require("fs")
const path = require("path")
const ROOT = "D:/CODE/SmartLuy/"
for (const w of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts", `KantumruyPro-${w}.ttf`), "Kantumruy Pro")
const V = process.env.VARIANT || "B", S = Number(process.env.SCALE || 1), OUT = process.argv[2]
const W = 1640, H = 924
const c = createCanvas(W * S, H * S), g = c.getContext("2d")
g.scale(S, S)
const F = (w, px) => `${w} ${px}px 'Kantumruy Pro'`

function phone(img, x, y, w, rot, island = true) {
  const h = w * img.height / img.width
  g.save(); g.translate(x, y); g.rotate(rot)
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 60; g.shadowOffsetY = 28
  g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(-11, -11, w + 22, h + 22, w * 0.15); g.fill()
  g.shadowColor = "transparent"
  g.save(); g.beginPath(); g.roundRect(0, 0, w, h, w * 0.125); g.clip(); g.drawImage(img, 0, 0, w, h); g.restore()
  if (island) { g.fillStyle = "#050806"; g.beginPath(); g.roundRect(w / 2 - w * 0.15, w * 0.035, w * 0.3, w * 0.085, 14); g.fill() }
  g.restore()
}
function toast(x, y, w, amount, sub, scale = 1) {
  const h = 104 * scale
  g.save(); g.shadowColor = "rgba(0,0,0,.28)"; g.shadowBlur = 36; g.shadowOffsetY = 14
  g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x, y, w, h, 26 * scale); g.fill(); g.restore()
  g.fillStyle = "#ecfdf5"; g.beginPath(); g.roundRect(x + 20 * scale, y + 22 * scale, 60 * scale, 60 * scale, 18 * scale); g.fill()
  const ix = x + 36 * scale, iy = y + 34 * scale
  g.fillStyle = "#059669"; g.beginPath(); g.moveTo(ix, iy + 10 * scale); g.lineTo(ix + 10 * scale, iy + 10 * scale); g.lineTo(ix + 22 * scale, iy); g.lineTo(ix + 22 * scale, iy + 36 * scale); g.lineTo(ix + 10 * scale, iy + 26 * scale); g.lineTo(ix, iy + 26 * scale); g.closePath(); g.fill()
  g.strokeStyle = "#059669"; g.lineWidth = 3 * scale
  for (const r of [10, 17]) { g.beginPath(); g.arc(ix + 24 * scale, iy + 18 * scale, r * scale, -0.9, 0.9); g.stroke() }
  g.fillStyle = "#047857"; g.font = F(700, 34 * scale); g.fillText(amount, x + 98 * scale, y + 56 * scale)
  g.fillStyle = "#55665e"; g.font = F(500, 22 * scale); g.fillText(sub, x + 98 * scale, y + 86 * scale)
}

;(async () => {
  const biz = await loadImage(ROOT + "Website/screen-business.webp")
  const me = await loadImage(ROOT + "Website/screen-personal.webp")
  const logo = await loadImage(ROOT + "Website/logo.png")

  if (V === "B") {
    // B — «the sound of a sale»: dark emerald, sound rings from the centre phone, the promise around it.
    const bg = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 1000)
    bg.addColorStop(0, "#0b6b52"); bg.addColorStop(0.55, "#054233"); bg.addColorStop(1, "#02261d")
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    g.strokeStyle = "rgba(252,211,77,.16)"; g.lineWidth = 2
    for (let r = 230; r < 1100; r += 85) { g.beginPath(); g.arc(W / 2, 470, r, 0, Math.PI * 2); g.stroke() }
    phone(biz, W / 2 - 165, 150, 330, 0)
    toast(W / 2 - 330, 420, 360, "ទទួលបាន 25,000 ៛", "KHQR · ABA")
    toast(W / 2 + 10, 650, 330, "ទទួលបាន $12.50", "KHQR · ACLEDA", 0.92)
    // left: the promise
    g.fillStyle = "#fcd34d"; g.font = F(600, 30); g.fillText("KHQR SoundBox", 110, 300)
    g.fillStyle = "#fff"; g.font = F(700, 84); g.fillText("លុយចូល", 110, 400); g.fillText("ឮភ្លាម", 110, 500)
    g.fillStyle = "#a7f3d0"; g.font = F(500, 32); g.fillText("ទូរសព្ទប្រកាសជាខ្មែរ", 110, 580); g.fillText("រាល់ពេលអតិថិជនបង់", 110, 626)
    // right: the brand and the address
    g.textAlign = "right"
    g.save(); g.beginPath(); g.roundRect(W - 110 - 96, 230, 96, 96, 26); g.clip(); g.drawImage(logo, W - 110 - 96, 230, 96, 96); g.restore()
    g.fillStyle = "#fff"; g.font = F(700, 52); g.fillText("អេប លុយឆ្លាត", W - 110, 400)
    g.fillStyle = "rgba(255,255,255,.7)"; g.font = F(500, 28); g.fillText("App Luy Chlat", W - 110, 444)
    g.fillStyle = "#fcd34d"; g.font = F(700, 40); g.fillText("luychlat.com", W - 110, 560)
    g.fillStyle = "#e8f5ef"; g.font = F(500, 26); g.fillText("ឥតគិតថ្លៃ · Android · iPhone · Telegram", W - 110, 604)
    g.textAlign = "left"
  } else {
    // C — «shop and home, apart»: light and warm, the two real screens side by side with their labels.
    const bg = g.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, "#fbfaf6"); bg.addColorStop(1, "#eef7f1")
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    const glow = g.createRadialGradient(1180, 470, 40, 1180, 470, 560); glow.addColorStop(0, "rgba(16,185,129,.22)"); glow.addColorStop(1, "rgba(16,185,129,0)")
    g.fillStyle = glow; g.fillRect(0, 0, W, H)
    const gold = g.createRadialGradient(150, 860, 20, 150, 860, 520); gold.addColorStop(0, "rgba(200,147,47,.16)"); gold.addColorStop(1, "rgba(200,147,47,0)")
    g.fillStyle = gold; g.fillRect(0, 0, W, H)
    phone(me, 1235, 175, 280, 0.06)
    phone(biz, 905, 150, 300, -0.05)
    // the labels on the phones
    const tag = (x, y, text, bgc, fg) => { g.font = F(700, 28); const w = g.measureText(text).width + 40; g.fillStyle = bgc; g.beginPath(); g.roundRect(x, y, w, 54, 27); g.fill(); g.fillStyle = fg; g.fillText(text, x + 20, y + 37) }
    tag(880, 690, "🏪 អាជីវកម្ម".replace("🏪 ", ""), "#047857", "#fff")
    tag(1300, 715, "ផ្ទាល់ខ្លួន", "#c8932f", "#fff")
    // left: the promise
    g.save(); g.beginPath(); g.roundRect(110, 210, 84, 84, 22); g.clip(); g.drawImage(logo, 110, 210, 84, 84); g.restore()
    g.fillStyle = "#064e3b"; g.font = F(700, 42); g.fillText("អេប លុយឆ្លាត", 214, 258)
    g.fillStyle = "#55665e"; g.font = F(500, 24); g.fillText("App Luy Chlat", 214, 290)
    g.fillStyle = "#12261e"; g.font = F(700, 80); g.fillText("លុយហាង", 110, 395)
    g.fillStyle = "#c8932f"; g.fillText("·", 450, 395)
    g.fillStyle = "#12261e"; g.fillText("លុយផ្ទះ", 500, 395)
    g.fillStyle = "#047857"; g.font = F(700, 64); g.fillText("ដាច់ពីគ្នា ច្បាស់លាស់", 110, 492)
    g.fillStyle = "#55665e"; g.font = F(500, 30); g.fillText("SoundBox KHQR · Telegram Bot · សមតុល្យលាក់ជានិច្ច", 110, 556)
    g.fillStyle = "#047857"; g.beginPath(); g.roundRect(110, 596, 420, 76, 38); g.fill()
    g.fillStyle = "#fff"; g.font = F(700, 36); g.fillText("luychlat.com", 150, 647)
    g.fillStyle = "#c8932f"; g.font = F(600, 26); g.fillText("ឥតគិតថ្លៃ", 560, 646)
  }
  fs.writeFileSync(OUT, c.toBuffer("image/png"))
  console.log(V, OUT, fs.statSync(OUT).size)
})()
