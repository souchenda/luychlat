/**
 * The NBC official rates table (founder, 21/10/2026 — one table for both channels): the currencies Cambodian families
 * and shops trade in, in one order — the dollar, the Thai baht and the Malaysian ringgit (daily for Cambodian Muslims),
 * then the yuan, the euro and the dong — as Telegram HTML in a monospaced block so the columns line up:
 *
 *   🇺🇸 1 USD       =  4,012 ៛
 *   🇹🇭 1 THB       = 123.45 ៛
 *   🇻🇳 1,000 VND   =    158 ៛
 *
 * A currency NBC did not publish is left out. Pure (nbc-rates.test.ts).
 */
import type { MarketLive } from "@/lib/market-calc"

export const RATE_ORDER = ["USD", "THB", "MYR", "CNY", "EUR", "VND"] as const

const FLAGS: Record<string, string> = { USD: "🇺🇸", THB: "🇹🇭", MYR: "🇲🇾", CNY: "🇨🇳", EUR: "🇪🇺", VND: "🇻🇳" }

const fmt = (n: number, digits = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

/** Each published currency: its flag, «1 USD» / «1,000 VND» (a small unit per 100 or 1,000, as NBC quotes it), riel. */
export function nbcRateItems(nbc: Pick<NonNullable<MarketLive["nbc"]>, "khr_per">): { code: string; flag: string; label: string; value: string }[] {
  const items: { code: string; flag: string; label: string; value: string }[] = []
  for (const code of RATE_ORDER) {
    const v = nbc.khr_per[code]
    if (!v) continue
    const unit = v < 1 ? 1000 : v < 10 ? 100 : 1
    items.push({ code, flag: FLAGS[code] ?? "💱", label: `${fmt(unit)} ${code}`, value: fmt(v * unit, v * unit >= 100 ? 0 : 2) })
  }
  return items
}

/** The rows, aligned for a monospaced block. */
export const nbcRateRows = (nbc: Pick<NonNullable<MarketLive["nbc"]>, "khr_per">): string[] =>
  nbcRateItems(nbc).map((i) => `${i.flag} ${i.label.padEnd(11)} = ${i.value.padStart(6)} ៛`)

/** The table as Telegram HTML (a <pre> block). */
export const nbcRatesBlock = (nbc: Pick<NonNullable<MarketLive["nbc"]>, "khr_per">) => `<pre>${nbcRateRows(nbc).join("\n")}</pre>`
