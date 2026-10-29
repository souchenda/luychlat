// luychlat.com quality gate (founder, 28/10/2026 — «the whole world sees it: no error, deliberate or not»): every page,
// every language. Run before a publish: node scripts/website-check.mjs  (exit 1 on any «✗»).
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { JSDOM } from "jsdom"

const ROOT = "Website"
const PAGES = ["index.html", "en/index.html", "zh/index.html", "personal.html", "family.html", "business.html", "islamic.html", "privacy.html", "delete-account.html", "404.html"]
// Khmer letters \u2014 the riel sign \u00AB\u17DB\u00BB (U+17DB) aside: it is a currency, in every language.
const KHMER = /[\u1780-\u17DA\u17DC-\u17FF]/
const issues = []
const bad = (page, msg) => issues.push(`✗ ${page}: ${msg}`)
const warn = (page, msg) => issues.push(`! ${page}: ${msg}`)

for (const page of PAGES) {
  const file = join(ROOT, page)
  if (!existsSync(file)) { bad(page, "missing"); continue }
  const html = readFileSync(file, "utf8")
  const doc = new JSDOM(html).window.document
  const lang = doc.documentElement.getAttribute("lang") || "km"
  const text = doc.body.textContent.replace(/\s+/g, " ")
  // 1. Words never used
  for (const [re, why] of [[/iBMS/, "«iBMS»"], [/កម្មវិធី/, "«កម្មវិធី» (the brand is «អេប»)"], [/អែប/, "«អែប» (spelled «អេប»)"]])
    if (re.test(text) || re.test(doc.title)) bad(page, why)
  const bare = text.replace(/https?:\/\/\S+|@\w+|\bluychlat\.com\b|App Luy Chlat/gi, "").match(/\bLuyChlat\b/)
  if (bare) bad(page, "a bare «LuyChlat» in the text")
  if (lang === "km" && / & /.test(text)) warn(page, "«&» in Khmer text (use «និង»)")
  // 2. Digits
  const kd = text.match(/[^\s]*[០-៩][^\s]*/g)
  if (kd) warn(page, `Khmer digits: ${[...new Set(kd)].slice(0, 6).join(" ")}`)
  // 3. Untranslated Khmer on an English / Chinese page (the brand name «អេប លុយឆ្លាត» and the language button «ខ្មែរ» aside)
  if (lang === "en" || lang === "zh") {
    for (const el of doc.querySelectorAll("[data-i]")) {
      const t = el.textContent.replace(/អេប លុយឆ្លាត|ខ្មែរ/g, "")
      if (KHMER.test(t)) bad(page, `untranslated (${el.getAttribute("data-i")}): «${el.textContent.trim().slice(0, 50)}»`)
    }
    // Also text outside the translated elements (a Khmer «។» after a link) and the images' alt text.
    const allowed = /អេប លុយឆ្លាត|ខ្មែរ|សម្រាប់អ្នក|សហគមន៍/g
    for (const node of [...doc.body.querySelectorAll("*")].flatMap((e) => [...e.childNodes]).filter((n) => n.nodeType === 3)) {
      const parent = node.parentElement
      if (parent.closest("[data-i], script, style, .phone, [aria-hidden=true]")) continue
      const t = node.textContent.replace(allowed, "")
      if (KHMER.test(t)) bad(page, `Khmer outside the translations: «${node.textContent.trim().slice(0, 40)}» in <${parent.tagName.toLowerCase()}>`)
    }
    for (const img of doc.querySelectorAll("img[alt]")) if (KHMER.test(img.getAttribute("alt").replace(allowed, ""))) bad(page, `Khmer alt text: «${img.getAttribute("alt").slice(0, 40)}»`)
  }
  // 4. Ids, anchors, files
  const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id)
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) bad(page, `duplicate id #${id}`)
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href")
    if (href.startsWith("#") && href.length > 1 && !doc.getElementById(href.slice(1))) bad(page, `link to a missing #${href.slice(1)}`)
    if (a.getAttribute("target") === "_blank" && !/noopener/.test(a.getAttribute("rel") || "")) warn(page, `target=_blank without rel=noopener: ${href}`)
    if (!/^(https?:|mailto:|tel:|#|data-)/.test(href)) {
      const p = href.split(/[?#]/)[0]
      const local = p === "" || p === "./" ? "index.html" : p.endsWith("/") ? p + "index.html" : p
      const target = join(dirname(file), local)
      if (!existsSync(target) && !existsSync(target + ".html")) bad(page, `link to a missing file: ${href}`)
    }
  }
  for (const el of doc.querySelectorAll("img[src], script[src], link[rel=stylesheet][href]")) {
    const src = (el.getAttribute("src") || el.getAttribute("href")).split("?")[0]
    if (/^https?:/.test(src)) continue
    if (!existsSync(join(dirname(file), src))) bad(page, `missing file ${src}`)
  }
  for (const img of doc.querySelectorAll("img")) if (!img.hasAttribute("alt")) warn(page, `image without alt: ${img.getAttribute("src")}`)
  // The line icons (founder, 29/10/2026): «/icons.svg#name» — the file there and the icon in it, on every page and language.
  for (const use of doc.querySelectorAll("use[href]")) {
    const [file, id] = use.getAttribute("href").split("#")
    const local = file.startsWith("/") ? join(ROOT, file.split("?")[0]) : join(dirname(join(ROOT, page)), file.split("?")[0])
    if (!existsSync(local)) bad(page, `icon file missing: ${use.getAttribute("href")}`)
    else if (!readFileSync(local, "utf8").includes(`<symbol id="${id}"`)) bad(page, `no icon «${id}» in ${file}`)
  }
  // 5. The page's own metadata
  if (!doc.title.trim()) bad(page, "no <title>")
  if (page !== "404.html" && !doc.querySelector('meta[name="description"]')?.getAttribute("content")) warn(page, "no meta description")
}
// 6. Every key the English / Chinese pages read is translated
const T = {}
new Function("window", readFileSync(join(ROOT, "i18n.js"), "utf8"))({ get SITE_T() { return T.v }, set SITE_T(v) { T.v = v } })
const keys = [...readFileSync(join(ROOT, "index.html"), "utf8").matchAll(/data-i="([^"]+)"/g)].map((m) => m[1])
for (const lang of ["en", "zh"]) for (const k of new Set(keys)) if (T.v[lang][k] == null) bad(`i18n.js (${lang})`, `no «${k}»`)
// A Chinese text that is the English one (the tips once were): words of 4+ Latin letters left after names and addresses.
for (const k of new Set(keys)) {
  const zh = T.v.zh[k], en = T.v.en[k]
  if (zh && zh === en && /[A-Za-z]{4,}/.test(zh.replace(/App Luy Chlat|Telegram|Facebook|Android|iPhone|Web|KHQR|SoundBox|ABA|ACLEDA|Wing|PRO|ULTRA|FREE|luychlat\.com|@\w+|https?:\S+/g, "")))
    bad("i18n.js (zh)", `«${k}» is the English text`)
}

// 7. The other pages' own translations (islamic-t.js, privacy-t.js, delete-t.js — window.EXTRA_T, merged by site.js)
for (const [page, script] of [["personal.html", "personal-t.js"], ["family.html", "family-t.js"], ["business.html", "business-t.js"], ["islamic.html", "islamic-t.js"], ["privacy.html", "privacy-t.js"], ["delete-account.html", "delete-t.js"]]) {
  const w = {}
  new Function("window", readFileSync(join(ROOT, script), "utf8"))(w)
  const extra = w.EXTRA_T || {}
  const pageKeys = new Set([...readFileSync(join(ROOT, page), "utf8").matchAll(/data-i="([^"]+)"/g)].map((m) => m[1]))
  for (const lang of ["en", "zh"])
    for (const k of pageKeys) {
      const v = extra[lang]?.[k] ?? T.v[lang]?.[k]
      if (v == null) bad(`${script} (${lang})`, `no «${k}» for ${page}`)
      else if (KHMER.test(String(v).replace(/អេប លុយឆ្លាត|ខ្មែរ/g, ""))) bad(`${script} (${lang})`, `«${k}» is still Khmer`)
    }
}

const errors = issues.filter((i) => i.startsWith("✗"))
console.log(issues.length ? issues.join("\n") : "✓ no issues")
console.log(`\n${errors.length} error(s), ${issues.length - errors.length} warning(s) on ${PAGES.length} pages`)
process.exit(errors.length ? 1 : 0)
