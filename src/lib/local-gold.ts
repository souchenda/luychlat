/**
 * Local Phnom Penh gold counter prices (USD per damlung, buy and sell), as
 * published every morning (~09:00) by CSNJ Diamond & Gold Shop on Oknha News
 * (oknha.news, category "តម្លៃមាសប្រចាំថ្ងៃ"), or entered by an admin with
 * /setgold. Only the numbers are taken, always with a link to the source.
 * Pure: no app or server imports.
 *
 * The article reads, e.g.:
 *   …សម្រាប់មាសគីឡូ មានតម្លៃ ១៣៣,៦០០ដុល្លារ នៅក្នុងមួយគីឡូជាតម្លៃលក់ចេញ និងទិញចូលក្នុងតម្លៃ ១៣២,២៧០ដុល្លារ។
 *   សម្រាប់តម្លៃក្នុង១តម្លឹង គឺមានតម្លៃ ៥,០១០ដុល្លារ ជាតម្លៃលក់ចេញ និងទិញចូលក្នុងតម្លៃ ៤,៩៦០ដុល្លារ។
 *   ដោយឡែកសម្រាប់មាសគ្រឿងអលង្ការ មានតម្លៃ ៥,០១០ដុល្លារ ជាតម្លៃលក់ចេញ និងទិញចូលក្នុងតម្លៃ ៤,៩៣៥ដុល្លារ។
 */

export type BuySell = { sell: number; buy: number }
export type LocalGold = {
  /** The day the prices are for (YYYY-MM-DD, Cambodia). */
  date: string
  /** Kilo gold (មាសគីឡូ), per damlung. */
  kilo: BuySell
  /** Jewelry gold (មាសគ្រឿង), per damlung; null when not published. */
  jewelry: BuySell | null
  source: "csnj" | "manual"
  /** The article it came from (csnj). */
  url?: string
  fetched_at: string
}

/** 1 kg of gold in damlung (37.5 g each). */
export const DAMLUNG_PER_KG = 1000 / 37.5

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"
const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))
const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const money = (s: string) => Number(latin(s).replace(/,/g, ""))

/** "…ថ្ងៃទី៣ ខែតុលា ឆ្នាំ២០២៦…" → "2026-10-03" (the first date in the text). */
export function khmerDate(text: string): string | null {
  const m = latin(text).match(/ថ្ងៃទី\s*(\d{1,2})\s*ខែ\s*([^\s\d]+?)\s*ឆ្នាំ\s*(\d{4})/)
  if (!m) return null
  const month = KM_MONTHS.findIndex((name) => m[2].startsWith(name))
  if (month < 0) return null
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`
}

// "<label> … <sell>ដុល្លារ … លក់ចេញ … ទិញចូល … <buy>ដុល្លារ", within one sentence (no ។).
const pair = (label: string) => new RegExp(`(?:${label})[^។]*?([\\d,]+)\\s*ដុល្លារ[^។]*?លក់ចេញ[^។]*?ទិញចូល[^។]*?([\\d,]+)\\s*ដុល្លារ`)

/** Prices from the article text; null if the expected sentences aren't there. */
export function parseCsnjArticle(text: string): Omit<LocalGold, "source" | "url" | "fetched_at"> | null {
  const t = latin(text.replace(/\s+/g, " "))
  const date = khmerDate(t)
  const kg = t.match(pair("មាសគីឡូ"))
  const perDamlung = t.match(pair("១តម្លឹង|1តម្លឹង|មួយតម្លឹង"))
  const jewelry = t.match(pair("គ្រឿងអលង្ការ|មាសគ្រឿង"))
  if (!date) return null
  let kilo: BuySell | null = perDamlung ? { sell: money(perDamlung[1]), buy: money(perDamlung[2]) } : null
  // Per-kg prices only: convert to damlung.
  if (!kilo && kg) kilo = { sell: Math.round(money(kg[1]) / DAMLUNG_PER_KG), buy: Math.round(money(kg[2]) / DAMLUNG_PER_KG) }
  if (!kilo) return null
  return { date, kilo, jewelry: jewelry ? { sell: money(jewelry[1]), buy: money(jewelry[2]) } : null }
}

/**
 * Sanity checks so a changed article never shows nonsense: buy ≤ sell, a
 * spread under 4%, and (when the world reference is known) within 10% of the
 * reference price per damlung.
 */
export function plausible(g: Pick<LocalGold, "kilo" | "jewelry">, reference24k?: number | null): boolean {
  const ok = (p: BuySell | null) =>
    !p || (p.sell > 500 && p.sell < 50_000 && p.buy > 0 && p.buy <= p.sell && (p.sell - p.buy) / p.sell < 0.04 && (!reference24k || Math.abs(p.sell / reference24k - 1) < 0.1))
  return ok(g.kilo) && ok(g.jewelry)
}

/** The CSNJ daily gold item for `day` in the Oknha News RSS feed: its link and text. */
export function findCsnjItem(feedXml: string, day: string): { url: string; text: string } | null {
  for (const item of feedXml.split("<item>").slice(1)) {
    const categories = [...item.matchAll(/<category><!\[CDATA\[(.*?)\]\]><\/category>/g)].map((m) => m[1])
    if (!categories.some((c) => c.includes("តម្លៃមាសប្រចាំថ្ងៃ"))) continue
    const html = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)?.[1] ?? ""
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    if (khmerDate(text) !== day) continue
    const url = item.match(/<link>(.*?)<\/link>/)?.[1]?.trim()
    if (url) return { url, text }
  }
  return null
}

/** "/setgold 5010 4960 [5010 4935]" → kilo sell/buy and optional jewelry sell/buy. */
export function parseSetGold(text: string): Pick<LocalGold, "kilo" | "jewelry"> | "clear" | null {
  const args = latin(text).replace(/^\/setgold(@\w+)?/i, "").trim()
  if (/^(clear|auto|off)$/i.test(args)) return "clear"
  const nums = args.split(/[\s|/]+/).filter(Boolean).map((s) => Number(s.replace(/[$,]/g, "")))
  if (!(nums.length === 2 || nums.length === 4) || nums.some((n) => !Number.isFinite(n) || n <= 0)) return null
  return { kilo: { sell: nums[0], buy: nums[1] }, jewelry: nums.length === 4 ? { sell: nums[2], buy: nums[3] } : null }
}
