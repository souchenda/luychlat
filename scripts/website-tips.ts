/**
 * «គន្លឹះលុយខ្លីៗ» on luychlat.com (founder, 28/10/2026 — «where are the short money tips?»): six tips from the app's
 * own library (src/lib/tips.ts — the vetted copy the channel publishes at 12:00, never retyped here), 0-9 digits like
 * the app. Writes the section between the markers in Website/index.html and its English / Chinese text into
 * Website/i18n.js (Chinese reads the English, as in the app). Then run scripts/website-i18n.mjs.
 *
 *   npx tsx scripts/website-tips.ts
 */
import { readFileSync, writeFileSync } from "node:fs"

import { latinDigits } from "../src/lib/dates"
import { TIPS } from "../src/lib/tips"

/** Short, everyday, one per need: saving, debt, the shop. */
export const WEBSITE_TIPS = ["emergency-fund", "separate-goals", "true-cost", "lending-family", "separate-money", "cash-flow-daily"]

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const tips = WEBSITE_TIPS.map((id) => {
  const t = TIPS.find((x) => x.id === id)
  if (!t) throw new Error(`tip ${id} is not in src/lib/tips.ts`)
  return t
})

const cards = tips
  .map(
    (t) => `          <article class="tip reveal">
            <h3 data-i="tip.${t.id}.t">${esc(latinDigits(t.title.km))}</h3>
            <p data-i="tip.${t.id}.b">${esc(latinDigits(t.body.km))}</p>
          </article>`,
  )
  .join("\n")
const section = `<!-- tips:start (scripts/website-tips.ts — do not edit by hand) -->
    <section class="tips" id="tips">
      <div class="wrap">
        <h2 class="center" data-i="tips.title">គន្លឹះលុយខ្លីៗ</h2>
        <p class="center sub" data-i="tips.sub">ពីបណ្ណាល័យគន្លឹះក្នុងអេប — សន្សំ សងបំណុល និងគ្រប់គ្រងហាង</p>
        <div class="tip-grid">
${cards}
        </div>
        <p class="center"><a class="more-link" href="https://app.luychlat.com/learn" data-i="tips.more">គន្លឹះច្រើនទៀតក្នុងអេប →</a></p>
      </div>
    </section>
    <!-- tips:end -->`

const PAGE = "Website/index.html"
let page = readFileSync(PAGE, "utf8")
const block = /<!-- tips:start[\s\S]*?<!-- tips:end -->/
// A function, never a string, as the replacement: «$10» in a tip would read as the group «$1» (it printed «0»).
page = block.test(page)
  ? page.replace(block, () => section)
  : page.replace(/(\s*)<section class="faq" id="faq">/, (_m, space: string) => `\n    ${section}${space}<section class="faq" id="faq">`)
writeFileSync(PAGE, page)

const json = (s: string) => JSON.stringify(s)
const lines = (lang: "en" | "zh") =>
  [
    `  // tips:start`,
    `  "tips.title": ${json(lang === "zh" ? "理财小贴士" : "Short money tips")},`,
    `  "tips.sub": ${json(lang === "zh" ? "来自应用内的贴士库——储蓄、还债与经营小店" : "From the app's tip library — saving, paying off debt, running a shop")},`,
    `  "tips.more": ${json(lang === "zh" ? "在应用中查看更多贴士 →" : "More tips in the app →")},`,
    ...tips.flatMap((t) => [`  "tip.${t.id}.t": ${json(latinDigits(t.title.en))},`, `  "tip.${t.id}.b": ${json(latinDigits(t.body.en))},`]),
    `  // tips:end`,
  ].join("\n")
const T = "Website/i18n.js"
let i18n = readFileSync(T, "utf8").replace(/\n  \/\/ tips:start[\s\S]*?\/\/ tips:end/g, "")
for (const [lang, anchor] of [["en", "    en: {\n"], ["zh", "    zh: {\n"]] as const) {
  if (!i18n.includes(anchor)) throw new Error(`Website/i18n.js: «${anchor.trim()}» not found`)
  i18n = i18n.replace(anchor, () => `${anchor}${lines(lang)}\n`)
}
writeFileSync(T, i18n)
console.log(`✓ ${tips.length} tips in Website/index.html and Website/i18n.js — now run scripts/website-i18n.mjs`)
