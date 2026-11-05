// luychlat.com in three languages, each at its own address (founder, 27/10/2026 — «a website of international standard»;
// every page since 5/11/2026 — «a checklist of what the website still lacks»): the Khmer pages (Website/index.html,
// personal.html, family.html, business.html, islamic.html, privacy.html, delete-account.html) are the source; this writes
// their English and Chinese twins (Website/en/…, Website/zh/…) with the text of Website/i18n.js and the page's own
// «-t.js» already in the page — so search engines and link previews see English and Chinese, not only Khmer — links the
// three together (hreflang; the language buttons and the page links stay in the reader's language) and writes
// Website/sitemap.xml, each address dated by the day its page last changed (scripts/website-pages.json).
//
//   node scripts/website-i18n.mjs          (after any change to a page, i18n.js or a «-t.js»)
//   node scripts/website-i18n.mjs --check  (exit 1 when a page or the sitemap is not up to date — scripts/website-check.mjs)

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

import { JSDOM } from "jsdom"

const SITE = path.join(process.cwd(), "Website")
const STATE = path.join(process.cwd(), "scripts", "website-pages.json")
const ORIGIN = "https://luychlat.com"
const LANGS = ["km", "en", "zh"]
const PREFIX = { km: "/", en: "/en/", zh: "/zh/" }
const OG_LOCALE = { km: "km_KH", en: "en_US", zh: "zh_CN" }
/** The pages: their clean name ("" = home), Khmer file and their own translations. */
export const PAGES = [
  { name: "", file: "index.html", t: null },
  { name: "personal", file: "personal.html", t: "personal-t.js" },
  { name: "family", file: "family.html", t: "family-t.js" },
  { name: "business", file: "business.html", t: "business-t.js" },
  { name: "islamic", file: "islamic.html", t: "islamic-t.js" },
  { name: "privacy", file: "privacy.html", t: "privacy-t.js" },
  { name: "delete-account", file: "delete-account.html", t: "delete-t.js" },
]
const NAMES = new Set(PAGES.map((p) => p.name))

const urlOf = (lang, name) => PREFIX[lang] + name
const fileOf = (lang, p) => (lang === "km" ? p.file : `${lang}/${p.name ? p.name + ".html" : "index.html"}`)

/** From a page at `from` to a site address `to` (both site-absolute). */
const rel = (from, to) => {
  const r = path.posix.relative(from.endsWith("/") ? from : path.posix.dirname(from), to)
  if (r === "") return "./"
  return to.endsWith("/") ? `${r}/` : r
}

function texts(p) {
  const sandbox = { window: {} }
  vm.runInNewContext(readFileSync(path.join(SITE, "i18n.js"), "utf8"), sandbox)
  if (p.t) vm.runInNewContext(readFileSync(path.join(SITE, p.t), "utf8"), sandbox)
  const w = sandbox.window
  const T = {}
  for (const l of ["en", "zh"]) T[l] = { ...(w.SITE_T?.[l] ?? {}), ...(w.EXTRA_T?.[l] ?? {}) }
  return { T, titles: w.PAGE_TITLES, descs: w.PAGE_DESC }
}

function render(p, lang) {
  const source = readFileSync(path.join(SITE, p.file), "utf8")
  const dom = new JSDOM(source)
  const d = dom.window.document
  const here = urlOf(lang, p.name)
  d.documentElement.lang = lang
  d.documentElement.setAttribute("data-fixed-lang", lang)
  const meta = (sel) => d.querySelector(sel)

  if (lang !== "km") {
    const { T, titles, descs } = texts(p)
    const t = T[lang]
    const missing = []
    for (const el of d.querySelectorAll("[data-i]")) {
      const v = t[el.getAttribute("data-i")]
      if (v == null) missing.push(el.getAttribute("data-i"))
      else el.innerHTML = v
    }
    if (missing.length) throw new Error(`${p.file} (${lang}): no text for ${[...new Set(missing)].join(", ")}`)
    const title = p.t ? titles?.[lang] : t["meta.title"]
    const desc = p.t ? descs?.[lang] : t["meta.desc"]
    if (!title || !desc) throw new Error(`${p.file} (${lang}): no title or description (PAGE_TITLES / PAGE_DESC in ${p.t})`)
    d.title = title
    meta('meta[name="description"]')?.setAttribute("content", desc)
    meta('meta[property="og:title"]')?.setAttribute("content", title)
    meta('meta[property="og:description"]')?.setAttribute("content", desc)
    // An image's description in the page's language (data-i-alt — founder, 28/10/2026).
    for (const el of d.querySelectorAll("[data-i-alt]")) {
      const v = t[el.getAttribute("data-i-alt")]
      if (v == null) throw new Error(`${p.file} (${lang}): no alt text for ${el.getAttribute("data-i-alt")}`)
      el.setAttribute("alt", v)
    }
  }
  meta('meta[property="og:locale"]')?.setAttribute("content", OG_LOCALE[lang])
  meta('meta[property="og:url"]')?.setAttribute("content", ORIGIN + here)
  let canonical = meta('link[rel="canonical"]')
  if (!canonical) {
    canonical = d.createElement("link")
    canonical.rel = "canonical"
    d.head.appendChild(canonical)
  }
  canonical.setAttribute("href", ORIGIN + here)

  // hreflang: each page names its three languages (and the Khmer one as the default)
  for (const old of d.querySelectorAll('link[rel="alternate"][hreflang]')) old.remove()
  let after = canonical
  for (const [l, u] of [...LANGS.map((l) => [l, urlOf(l, p.name)]), ["x-default", urlOf("km", p.name)]]) {
    const link = d.createElement("link")
    link.rel = "alternate"
    link.hreflang = l
    link.href = ORIGIN + u
    after.after(link)
    after = link
  }

  // the language buttons go to the same page in the other language
  for (const b of d.querySelectorAll("[data-lang]")) {
    b.setAttribute("data-href", rel(here, urlOf(b.getAttribute("data-lang"), p.name)))
    b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang))
  }

  // Links to another page stay in this language; the site's files are found from inside /en/ or /zh/.
  if (lang !== "km") {
    for (const [attr, sel] of [["src", "[src]"], ["href", "link[href], a[href]"]]) {
      for (const el of d.querySelectorAll(sel)) {
        const v = el.getAttribute(attr)
        if (!v || /^(https?:|mailto:|tel:|#|data:|\/)/.test(v)) continue
        const [, file, rest] = v.replace(/^\.\//, "").match(/^([^?#]*)(.*)$/)
        const name = file === "" ? "" : file.replace(/\.html$/, "")
        if (el.tagName === "A" && NAMES.has(name)) el.setAttribute(attr, rel(here, urlOf(lang, name)) + rest)
        else el.setAttribute(attr, rel(here, "/" + file) + rest)
      }
    }
  }
  // The same page every run: the parser moves the file's last newline into <body>, so each run would add a line.
  while (d.body.lastChild?.nodeType === 3 && !d.body.lastChild.textContent.trim()) d.body.lastChild.remove()
  d.body.appendChild(d.createTextNode("\n"))
  return "<!DOCTYPE html>\n" + d.documentElement.outerHTML + "\n"
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(new Date())
const hash = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16)

/** Every output: { file, url, html } in a stable order. */
function build() {
  const out = []
  for (const p of PAGES) for (const lang of LANGS) out.push({ file: fileOf(lang, p), url: urlOf(lang, p.name), page: p.name, html: render(p, lang) })
  return out
}

function sitemap(out, dates) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
  for (const o of out) {
    const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}${urlOf(l, o.page)}"/>`).join("")
    lines.push(`  <url><loc>${ORIGIN}${o.url}</loc><lastmod>${dates[o.url]}</lastmod>${alts}</url>`)
  }
  return lines.join("\n") + "\n</urlset>\n"
}

const check = process.argv.includes("--check")
const out = build()
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {}
const next = {}
const stale = []
for (const o of out) {
  const h = hash(o.html)
  const prev = state[o.url]
  next[o.url] = prev && prev.hash === h ? prev : { hash: h, lastmod: today }
  const onDisk = existsSync(path.join(SITE, o.file)) ? readFileSync(path.join(SITE, o.file), "utf8").replace(/\r\n/g, "\n") : null
  if (onDisk !== o.html || !prev || prev.hash !== h) stale.push(o.file)
}
const map = sitemap(out, Object.fromEntries(Object.entries(next).map(([u, v]) => [u, v.lastmod])))
const mapOnDisk = existsSync(path.join(SITE, "sitemap.xml")) ? readFileSync(path.join(SITE, "sitemap.xml"), "utf8").replace(/\r\n/g, "\n") : null

if (check) {
  if (mapOnDisk !== map) stale.push("sitemap.xml")
  if (stale.length) {
    console.log(`✗ not up to date: ${stale.join(", ")} — run: node scripts/website-i18n.mjs`)
    process.exit(1)
  }
  console.log(`✓ ${out.length} pages in three languages and the sitemap are up to date`)
} else {
  for (const o of out) {
    mkdirSync(path.dirname(path.join(SITE, o.file)), { recursive: true })
    writeFileSync(path.join(SITE, o.file), o.html)
  }
  writeFileSync(path.join(SITE, "sitemap.xml"), map)
  writeFileSync(STATE, JSON.stringify(next, null, 2) + "\n")
  console.log(`Website: ${out.length} pages (${PAGES.length} × km / en / zh) and the sitemap written${stale.length ? ` — changed: ${stale.join(", ")}` : ""}`)
}
