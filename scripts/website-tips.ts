/**
 * «គន្លឹះលុយខ្លីៗ» on luychlat.com (founder, 28/10/2026 — «where are the short money tips?»): six tips from the app's
 * own library (src/lib/tips.ts — the vetted copy the channel publishes at 12:00, never retyped here), 0-9 digits like
 * the app. Writes the section between the markers in Website/index.html and its English / Chinese text into
 * Website/i18n.js (Chinese from ZH below — never the English on the Chinese page). Then run scripts/website-i18n.mjs.
 *
 *   npx tsx scripts/website-tips.ts
 */
import { readFileSync, writeFileSync } from "node:fs"

import { latinDigits } from "../src/lib/dates"
import { TIPS } from "../src/lib/tips"

/** Short, everyday, one per need: saving, debt, the shop. */
export const WEBSITE_TIPS = ["emergency-fund", "separate-goals", "true-cost", "lending-family", "separate-money", "cash-flow-daily"]

/** The Chinese page's own words (the app's library is km / en only — never the English on the Chinese page). */
const ZH: Record<string, { t: string; b: string }> = {
  "emergency-fund": { t: "建立应急备用金", b: "目标是存够 3–6 个月的必要开支，并单独存放。从小额开始——哪怕每周 $10，也会慢慢积少成多。" },
  "separate-goals": { t: "给储蓄起个名字", b: "为“孩子学费”或“新摩托车”存钱，比“随便存点”更容易坚持。分别设定目标，看着它一天天增长。" },
  "true-cost": { t: "了解贷款的真实成本", b: "月息 2%，一年大约就是 24%。借钱前先用应用里的贷款计算器，算清楚要付的总利息。" },
  "lending-family": { t: "借钱也要留记录", b: "即使是借给亲戚，也要记下金额、日期和还款日。这样既保护彼此的关系，提醒还款时也不尴尬。" },
  "separate-money": { t: "店里的钱和家里的钱分开", b: "生意用单独的钱包。从店里拿钱自用时，记为“老板支取”，才能看到真实的利润。" },
  "cash-flow-daily": { t: "每天看现金流", b: "账面上的利润不等于手里的现金。每天检查进账、出账，以及谁还欠你钱。" },
}
for (const id of WEBSITE_TIPS) if (!ZH[id]) throw new Error(`no Chinese for tip ${id}`)

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
    ...tips.flatMap((t) =>
      lang === "zh"
        ? [`  "tip.${t.id}.t": ${json(ZH[t.id].t)},`, `  "tip.${t.id}.b": ${json(ZH[t.id].b)},`]
        : [`  "tip.${t.id}.t": ${json(latinDigits(t.title.en))},`, `  "tip.${t.id}.b": ${json(latinDigits(t.body.en))},`],
    ),
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
