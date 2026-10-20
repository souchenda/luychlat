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

export const GRAMS_PER_DAMLUNG = 37.5
export const GRAMS_PER_CHI = 3.75
export const GRAMS_PER_TROY_OUNCE = 31.1034768

export type IslamicMarket = {
  /** The NBC rate's official day (YYYY-MM-DD), or null without one. */
  rateDate: string | null
  usdKhr: number | null
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
    rateDate: market?.nbc?.date ?? null,
    usdKhr,
    sarKhr: usdKhr ? Math.round(khrPerSar(usdKhr)) : null,
    gold,
    nisab: nisabUsd !== null ? { usd: nisabUsd, khr: usdKhr ? roundRiel(nisabUsd * usdKhr) : null } : null,
  }
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
    "💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ ធនាគារជាតិនៃកម្ពុជា (NBC)</b>",
    `• 1 USD = ${riel(m.usdKhr)}${m.rateDate ? ` (អត្រាផ្លូវការ ${esc(m.rateDate.split("-").reverse().join("/"))})` : ""}`,
  ]
  if (m.gold && m.nisab) {
    lines.push(
      "",
      "🥇 <b>ហាងឆេងមាស និងកម្រិតនីស៊បហ្សាកាត់ (Zakat Nisab)</b>",
      `• តម្លៃមាស ១ ក្រាម ≈ ${usd(m.gold.perGram, 2)} (${m.gold.source === "local" ? "មាសគីឡូ ភ្នំពេញ" : "តម្លៃអន្តរជាតិ"})`,
      `• <b>កម្រិតនីស៊បហ្សាកាត់ (មាស ៨៥ ក្រាម) = ${usd(m.nisab.usd)}${m.nisab.khr ? ` (~${riel(m.nisab.khr)})` : ""}</b>`,
      "",
      `ℹ️ បញ្ជាក់៖ ${zakatNote("channel")}`,
    )
  }
  lines.push("", "គណនាហ្សាកាត់ និងផែនការសន្សំធ្វើរូកូនដោយឥតគិតថ្លៃ៖", `🌐 ${o.appUrl.replace(/\/+$/, "")}/islamic`, "— អេប លុយឆ្លាត · សហគមន៍ឥស្លាម")
  return lines.join("\n")
}
