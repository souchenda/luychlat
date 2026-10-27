// luychlat.com in three languages, each at its own address (founder, 27/10/2026 — «a website of international standard»):
// the Khmer home page (Website/index.html) is the source; this writes Website/en/index.html and Website/zh/index.html
// with the text of Website/i18n.js already in the page — so search engines and link previews see English and Chinese,
// not only Khmer — and links the three together (hreflang; the language buttons go to the other pages).
//
//   node scripts/website-i18n.mjs        (after any change to Website/index.html or Website/i18n.js)

import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

import { JSDOM } from "jsdom"

const SITE = path.join(process.cwd(), "Website")
const ORIGIN = "https://luychlat.com"
const PAGES = { km: "/", en: "/en/", zh: "/zh/" }
const OG_LOCALE = { km: "km_KH", en: "en_US", zh: "zh_CN" }

const sandbox = { window: {} }
vm.runInNewContext(readFileSync(path.join(SITE, "i18n.js"), "utf8"), sandbox)
const T = sandbox.window.SITE_T

const source = readFileSync(path.join(SITE, "index.html"), "utf8")

/** From a page at `from` to a site file `file` (both site-absolute paths). */
const rel = (from, file) => {
  const r = path.posix.relative(from.endsWith("/") ? from : path.posix.dirname(from), file)
  if (r === "") return "./"
  return file.endsWith("/") ? `${r}/` : r
}

function page(lang) {
  const dom = new JSDOM(source)
  const d = dom.window.document
  const here = PAGES[lang]
  d.documentElement.lang = lang
  d.documentElement.setAttribute("data-fixed-lang", lang)

  if (lang !== "km") {
    const t = T[lang]
    const missing = []
    for (const el of d.querySelectorAll("[data-i]")) {
      const v = t[el.getAttribute("data-i")]
      if (v == null) missing.push(el.getAttribute("data-i"))
      else el.innerHTML = v
    }
    if (missing.length) throw new Error(`${lang}: no text for ${[...new Set(missing)].join(", ")}`)
    d.title = t["meta.title"]
    d.querySelector('meta[name="description"]').setAttribute("content", t["meta.desc"])
    d.querySelector('meta[property="og:title"]').setAttribute("content", t["meta.title"])
    d.querySelector('meta[property="og:description"]').setAttribute("content", t["meta.desc"])
    // the images' alt text and the QR's label stay as they are (names and addresses)
  }
  d.querySelector('meta[property="og:locale"]').setAttribute("content", OG_LOCALE[lang])
  d.querySelector('meta[property="og:url"]').setAttribute("content", ORIGIN + here)
  d.querySelector('link[rel="canonical"]').setAttribute("href", ORIGIN + here)

  // hreflang: each page names all three (and the Khmer one as the default)
  for (const old of d.querySelectorAll('link[rel="alternate"][hreflang]')) old.remove()
  const canonical = d.querySelector('link[rel="canonical"]')
  for (const [l, p] of [...Object.entries(PAGES), ["x-default", "/"]]) {
    const link = d.createElement("link")
    link.rel = "alternate"
    link.hreflang = l
    link.href = ORIGIN + p
    canonical.after(link)
  }

  // the language buttons go to the other pages
  for (const b of d.querySelectorAll("[data-lang]")) b.setAttribute("data-href", rel(here, PAGES[b.getAttribute("data-lang")]))

  // the site's own files, from inside /en/ or /zh/
  if (here !== "/") {
    for (const [attr, sel] of [["src", "[src]"], ["href", "link[href], a[href]"]]) {
      for (const el of d.querySelectorAll(sel)) {
        const v = el.getAttribute(attr)
        if (!v || /^(https?:|mailto:|#|data:|\/\/)/.test(v)) continue
        el.setAttribute(attr, rel(here, "/" + v.replace(/^\.\//, "")))
      }
    }
  }
  return "<!DOCTYPE html>\n" + d.documentElement.outerHTML + "\n"
}

writeFileSync(path.join(SITE, "index.html"), page("km"))
for (const lang of ["en", "zh"]) {
  mkdirSync(path.join(SITE, lang), { recursive: true })
  writeFileSync(path.join(SITE, lang, "index.html"), page(lang))
}
console.log("Website: / (km), /en/, /zh/ written")
