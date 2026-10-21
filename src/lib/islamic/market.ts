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
import { khrPerSar } from "@/lib/islamic/sar"
import type { MarketLive } from "@/lib/market-calc"
import { roundRiel } from "@/lib/money"
import { postFooter } from "@/lib/post-footer"

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
    ? "តម្លៃយោងមាសគីឡូ ២៤K ផ្សារភ្នំពេញ · ទីផ្សារជាក់ស្តែងតាមហាងអាចមានគម្លាតបន្តិចបន្តួច"
    : "តម្លៃយោងមាសសុទ្ធ ២៤K អន្តរជាតិ · ទីផ្សារជាក់ស្តែងតាមហាងក្នុងស្រុកអាចមានគម្លាតខុសគ្នាបន្តិចបន្តួច"

/** The price's source in two or three words, for the bulletin's gold line — never a silent source. */
export const goldSourceShort = (source: "local" | "spot") => (source === "local" ? "មាសគីឡូ ផ្សារភ្នំពេញ" : "តម្លៃអន្តរជាតិ")

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
  /** The MoC's current retail prices (riel per litre) — `stale` once their cycle has ended. */
  fuel: { regular: number; diesel: number; stale: boolean } | null
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
    fuel: market?.fuel?.regular && market.fuel.diesel ? { regular: market.fuel.regular, diesel: market.fuel.diesel, stale: market.fuel.to < today } : null,
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
  // The channel's one sentence (founder, 21/10/2026 — «strip long legalistic disclaimers»).
  if (who === "channel") return "ទ្រព្យសល់ដល់កម្រិតនីស៊បនេះ គម្រប់ ១ ឆ្នាំ មានកាតព្វកិច្ចចេញហ្សាកាត់ ២.៥%"
  return "ប្រសិនបើលោកអ្នកមានទ្រព្យសន្សំសរុបស្មើ ឬលើសពីកម្រិតនីស៊បនេះ ហើយគម្រប់ខួប ១ ឆ្នាំ (ហូល) លោកអ្នកមានកាតព្វកិច្ចបញ្ចេញហ្សាកាត់ ២.៥%។"
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The daily Islamic market bulletin for @LuyChlatIslamic (HTML) — the founder's three sections (21/10/2026):
 *   💵 the NBC rates in one list, the Saudi riyal beside the dollar (Hajj and Umrah) · ⛽ the MoC fuel prices ·
 *   🥇 24K gold in ជី / តម្លឹង and the 85 g Nisab — then the Zakat note, the app and the standard Islamic footer.
 * Everyone together — «អាស្សាឡាមុអាឡៃកុម បងប្អូន!». Null when there is no NBC rate (nothing factual to publish).
 */
/**
 * The Islamic market bulletin (founder, 21/10/2026 — «dense walls of text»): a two-line header (the date, the salam), then
 * three short blocks with a blank line between them — the official rates (the dollar and the riyal), the fuel, the gold
 * and the Nisab with the one-sentence Zakat note — the app's link and the standard Islamic footer.
 */
export function islamicBulletinHtml(m: IslamicMarket, o: { hijri: string; gregorian: string; appUrl: string }): string | null {
  if (!m.usdKhr) return null
  const wd = /^(ថ្ងៃ\S+)\s+(.+)$/.exec(o.gregorian)
  const lines = [
    wd ? `📅 <b>${esc(wd[1])} ${esc(o.hijri)}</b> · ${esc(wd[2])}` : `📅 <b>${esc(o.hijri)}</b> · ${esc(o.gregorian)}`,
    `🌙 ${G.SALAM_ALL}`,
    "",
    `💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ NBC និង SAR</b>${m.rateDate ? ` · ${esc(m.rateDate.slice(8, 10))}/${esc(m.rateDate.slice(5, 7))}` : ""}`,
    `• 🇺🇸 1 USD = ${riel(m.usdKhr)}`,
    ...(m.sarKhr ? [`• 🇸🇦 1 SAR ≈ ${riel(m.sarKhr)} · សម្រាប់ហាជ និងអ៊ុមរ៉ោះ`] : []),
  ]
  if (m.fuel) {
    lines.push(
      "",
      "⛽ <b>តម្លៃប្រេងឥន្ធនៈ ក្រសួងពាណិជ្ជកម្ម</b>",
      `• សាំង EA92 ${num(m.fuel.regular)} ៛ · ម៉ាស៊ូត ${num(m.fuel.diesel)} ៛ ក្នុង ១ លីត្រ${m.fuel.stale ? " · តម្លៃវដ្តមុន" : ""}`,
    )
  }
  if (m.gold && m.nisab) {
    const goldDay = m.gold.date && m.gold.date !== m.day ? ` · តម្លៃថ្ងៃ ${esc(m.gold.date.slice(8, 10))}/${esc(m.gold.date.slice(5, 7))}` : ""
    lines.push(
      "",
      "🥇 <b>ហាងឆេងមាស ២៤K និងនីស៊បហ្សាកាត់</b>",
      `• ${goldUnitsLine(m.gold)} · ${goldSourceShort(m.gold.source)}${goldDay}`,
      `• នីស៊ប មាស ៨៥ ក្រាម ៖ <b>${usd(m.nisab.usd)}</b>${m.nisab.khr ? ` ~ ${riel(m.nisab.khr)}` : ""}`,
      `(${zakatNote("channel")})`,
    )
  }
  lines.push("", `គណនាហ្សាកាត់ដោយឥតគិតថ្លៃលើ អេប លុយឆ្លាត 👉 ${o.appUrl.replace(/\/+$/, "")}/islamic`, "", postFooter("islamic"))
  return lines.join("\n")
}
