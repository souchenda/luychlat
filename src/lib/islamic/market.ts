/**
 * The rates and gold an Islamic household needs in one place (founder, 20/10/2026): the NBC dollar rate, the Saudi
 * riyal for Hajj and Umrah, gold per gram / chi / damlung, and the Zakat Nisab of 85 g of gold — for the card on
 * /islamic and the daily bulletin on @LuyChlatIslamic (never the general channel). Pure (market.test.ts).
 *
 * Gold per gram: today's Phnom Penh kilo gold (CSNJ, per damlung of 37.5 g) when it is at most 3 days old, else the
 * international spot price (per troy ounce of 31.1034768 g) — the source is always named. The Nisab is an estimate
 * from that price, to the dollar; riel the app computes is rounded to 100 ៛ (lib/money roundRiel).
 */
import * as G from "@/lib/islamic/glossary"
import { NISAB_GOLD_GRAMS } from "@/lib/islamic"
import { khrPerSar, SAR_PER_USD } from "@/lib/islamic/sar"
import type { MarketLive } from "@/lib/market-calc"
import { roundRiel } from "@/lib/money"
import { nbcRatesBlock } from "@/lib/nbc-rates"
import { compactFooter } from "@/lib/post-footer"

export const GRAMS_PER_DAMLUNG = 37.5
export const GRAMS_PER_CHI = 3.75
export const GRAMS_PER_HUN = 0.375
export const GRAMS_PER_LI = 0.0375

const kmNum = (n: number) => String(n).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/**
 * A weight in the units Cambodia trades gold by (founder, 21/10/2026): តម្លឹង 37.5 g · ជី 3.75 g · ហ៊ុន 0.375 g · លី 0.0375 g,
 * to the nearest លី, zero units left out — 85 g is «២ តម្លឹង ២ ជី ៦ ហ៊ុន ៧ លី» (2 × 37.5 + 2 × 3.75 + 6 × 0.375 + 7 × 0.0375
 * = 85.01 g; «… ៦ ហ៊ុន» alone would be 84.75 g, under the Nisab).
 */
export function khmerGoldWeight(grams: number): string {
  let li = Math.round(grams / GRAMS_PER_LI)
  const parts: [number, string][] = []
  for (const [size, name] of [[1000, "តម្លឹង"], [100, "ជី"], [10, "ហ៊ុន"], [1, "លី"]] as const) {
    const n = Math.floor(li / size)
    li -= n * size
    if (n) parts.push([n, name])
  }
  return parts.map(([n, name]) => `${kmNum(n)} ${name}`).join(" ")
}

/** Where today's gold price comes from, and that a shop's own price may differ a little (never a silent source). */
export const goldReference = (source: "local" | "spot") =>
  source === "local"
    ? "តម្លៃយោងមាសគីឡូ ២៤K ផ្សារភ្នំពេញ · ទីផ្សារជាក់ស្តែងតាមហាងនីមួយៗអាចមានគម្លាតខុសគ្នាបន្តិចបន្តួច"
    : "តម្លៃយោងមាសសុទ្ធ ២៤K អន្តរជាតិ · ទីផ្សារជាក់ស្តែងតាមហាងក្នុងស្រុកអាចមានគម្លាតខុសគ្នាបន្តិចបន្តួច"

/** «១ ជី ≈ $413 · ១ តម្លឹង ≈ $4,125 (១ ក្រាម ≈ $110.00)» — Cambodian units first, the gram in brackets. */
export const goldUnitsLine = (g: { perGram: number; perChi: number; perDamlung: number }) =>
  `១ ជី ≈ ${usd(g.perChi)} · ១ តម្លឹង ≈ ${usd(g.perDamlung)} (១ ក្រាម ≈ ${usd(g.perGram, 2)})`
export const GRAMS_PER_TROY_OUNCE = 31.1034768

export type IslamicMarket = {
  /** The day these figures are for (Cambodia) — a gold price from another day is dated in the bulletin. */
  day: string
  /** The NBC rate's official day (YYYY-MM-DD), or null without one. */
  rateDate: string | null
  usdKhr: number | null
  /** NBC's riel per unit of each currency (the full table — lib/nbc-rates.ts). */
  rates: Record<string, number> | null
  sarKhr: number | null
  gold: { perGram: number; perChi: number; perDamlung: number; source: "local" | "spot"; date: string } | null
  nisab: { usd: number; khr: number | null } | null
}

const cents = (n: number) => Math.round(n * 100) / 100

export function islamicMarket(market: MarketLive | null | undefined, today: string): IslamicMarket {
  const usdKhr = market?.nbc?.usd_khr && market.nbc.usd_khr > 0 ? market.nbc.usd_khr : null
  const local = market?.local_gold
  const localFresh = local?.kilo?.sell && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${local.date}T00:00:00Z`) <= 3 * 86_400_000
  const perGram = localFresh ? local!.kilo.sell / GRAMS_PER_DAMLUNG : market?.gold?.gold_spot ? market.gold.gold_spot / GRAMS_PER_TROY_OUNCE : null
  const gold = perGram
    ? {
        perGram: cents(perGram),
        perChi: cents(perGram * GRAMS_PER_CHI),
        perDamlung: cents(perGram * GRAMS_PER_DAMLUNG),
        source: localFresh ? ("local" as const) : ("spot" as const),
        date: localFresh ? local!.date : (market?.gold?.updated_at ?? "").slice(0, 10),
      }
    : null
  const nisabUsd = gold ? Math.round(NISAB_GOLD_GRAMS * perGram!) : null
  return {
    day: today,
    rateDate: market?.nbc?.date ?? null,
    usdKhr,
    rates: market?.nbc?.khr_per ? { ...market.nbc.khr_per, ...(usdKhr ? { USD: usdKhr } : {}) } : usdKhr ? { USD: usdKhr } : null,
    sarKhr: usdKhr ? Math.round(khrPerSar(usdKhr)) : null,
    gold,
    nisab: nisabUsd !== null ? { usd: nisabUsd, khr: usdKhr ? roundRiel(nisabUsd * usdKhr) : null } : null,
  }
}

/** Zakat on wealth that reaches the Nisab: 2.5% (one fortieth). */
export const ZAKAT_RATE = 0.025

/**
 * The quick check on /islamic (founder, 21/10/2026): a member types their net savings in $ or ៛ — does it reach today's
 * Nisab, and the 2.5% due. Entered in riel, the riel due is computed from the riel (100 ៛ rounding — it is computed);
 * the dollar side converts at the NBC rate. Null without today's Nisab (no gold price) or, for riel, without the rate.
 */
export function nisabCheck(m: IslamicMarket, amount: number, currency: "USD" | "KHR"): { usd: number; meets: boolean; zakatUsd: number; zakatKhr: number | null } | null {
  if (!m.nisab || !Number.isFinite(amount) || amount < 0) return null
  if (currency === "KHR" && !m.usdKhr) return null
  const asUsd = currency === "USD" ? amount : amount / m.usdKhr!
  const meets = asUsd >= m.nisab.usd
  if (!meets) return { usd: cents(asUsd), meets, zakatUsd: 0, zakatKhr: 0 }
  const zakatUsd = cents(asUsd * ZAKAT_RATE)
  const zakatKhr = currency === "KHR" ? roundRiel(amount * ZAKAT_RATE) : m.usdKhr ? roundRiel(zakatUsd * m.usdKhr) : null
  return { usd: cents(asUsd), meets, zakatUsd, zakatKhr }
}

const num = (n: number, digits = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
export const usd = (n: number, digits = 0) => `$${num(n, digits)}`
export const riel = (n: number) => `${num(n)} ៛`

/** The Zakat note under the Nisab (the founder's words) — «បងប្អូន» in the channel, «លោកអ្នក» in the app. */
export const zakatNote = (who: "channel" | "app") => {
  const you = who === "channel" ? G.BROTHERS_AND_SISTERS : "លោកអ្នក"
  return `ប្រសិនបើ${you}មានទ្រព្យសន្សំសរុបស្មើ ឬលើសពីកម្រិតនីស៊បនេះ ហើយគម្រប់ខួប ១ ឆ្នាំ (ហូល) ${you}មានកាតព្វកិច្ចបញ្ចេញហ្សាកាត់ ២.៥%។`
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The daily Islamic market bulletin for @LuyChlatIslamic (HTML): everyone together — «អាស្សាឡាមុអាឡៃកុម បងប្អូន!».
 * Null when there is no NBC rate (nothing factual to publish).
 */
export function islamicBulletinHtml(m: IslamicMarket, o: { hijri: string; gregorian: string; appUrl: string }): string | null {
  if (!m.usdKhr) return null
  const lines = [
    "🌙 <b>ព្រឹត្តិបត្រហាងឆេងរូបិយប័ណ្ណ និងនីស៊បមាសហ្សាកាត់</b>",
    `📅 ${esc(o.hijri)} (${G.HIJRI_CORRESPONDS} ${esc(o.gregorian)})`,
    "",
    `<b>${G.SALAM_ALL}</b> នេះជាព័ត៌មានហាងឆេងរូបិយប័ណ្ណផ្លូវការ (ធនាគារជាតិ NBC) និងតម្លៃមាសគណនាហ្សាកាត់សម្រាប់ថ្ងៃនេះ៖`,
    "",
    "🇸🇦 <b>ប្រាក់អារ៉ាប់ (SAR - Saudi Riyal សម្រាប់ធ្វើរូកូន ហាជ និងអ៊ុមរ៉ោះ)</b>",
    `• 1 SAR ≈ ${riel(m.sarKhr!)}`,
    `• 1 USD = ${SAR_PER_USD} SAR ($100 ≈ ${num(100 * SAR_PER_USD)} SAR)`,
    "",
    // The full NBC table, as in the community bulletin (founder, 21/10/2026): USD, THB, MYR, CNY, EUR, VND.
    `💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ ធនាគារជាតិនៃកម្ពុជា (NBC)</b>${m.rateDate ? ` · ${esc(m.rateDate.split("-").reverse().join("/"))}` : ""}`,
    nbcRatesBlock({ khr_per: m.rates ?? { USD: m.usdKhr } }),
  ]
  if (m.gold && m.nisab) {
    lines.push(
      "",
      "🥇 <b>ហាងឆេងមាស និងកម្រិតនីស៊បហ្សាកាត់ (Zakat Nisab)</b>",
      // Cambodian units first, the gram in brackets, then the price's reference (founder, 21/10/2026).
      `• ហាងឆេងមាស ២៤K ៖ ${goldUnitsLine(m.gold)}`,
      `  (${goldReference(m.gold.source)}${m.gold.date && m.gold.date !== m.day ? ` · តម្លៃថ្ងៃ ${esc(m.gold.date.slice(8, 10))}/${esc(m.gold.date.slice(5, 7))}` : ""})`,
      `• <b>កម្រិតនីស៊បហ្សាកាត់ (មាស ៨៥ ក្រាម ≈ ${khmerGoldWeight(NISAB_GOLD_GRAMS)}) = ${usd(m.nisab.usd)}${m.nisab.khr ? ` (~${riel(m.nisab.khr)})` : ""}</b>`,
      "",
      `ℹ️ បញ្ជាក់៖ ${zakatNote("channel")}`,
    )
  }
  // The compact one-line footer (founder, 21/10/2026): the channel and its hashtags under the signature.
  lines.push("", "គណនាហ្សាកាត់ និងផែនការសន្សំធ្វើរូកូនដោយឥតគិតថ្លៃ៖", `🌐 ${o.appUrl.replace(/\/+$/, "")}/islamic`, "— អេប លុយឆ្លាត · សហគមន៍ឥស្លាម", compactFooter("islamic"))
  return lines.join("\n")
}
