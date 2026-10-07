/**
 * The National Bank of Cambodia's own exchange-rate page
 * (nbc.gov.kh/english/economic_research/exchange_rate.php), parsed. Pure.
 *
 *   Exchange Rate on : <font>2026-10-07</font>
 *   Official Exchange Rate : <font>4062</font> KHR / USD
 *   <tr><td>Thai Baht</td><td>THB/KHR</td><td>1</td><td>bid</td><td>ask</td><td>average</td></tr>
 *
 * Other currencies are KHR per `Unit` (1, 100 or 1,000) at the Average; we keep
 * KHR per 1 unit, as the rest of the app does.
 */
import type { NbcRates } from "@/lib/market-calc"

const round = (v: number) => (v >= 100 ? Math.round(v) : v >= 1 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000)

export function parseNbcPage(html: string): Omit<NbcRates, "source" | "fetched_at"> | null {
  const text = html.replace(/\s+/g, " ")
  const date = /Exchange Rate on\s*:\s*(?:<[^>]+>\s*)*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1]
  const usd = Number(/Official Exchange Rate\s*:\s*(?:<[^>]+>\s*)*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1]?.replace(/,/g, ""))
  if (!date || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || !(usd > 3000 && usd < 6000)) return null

  const khr_per: Record<string, number> = { USD: usd }
  const row = /<td[^>]*>\s*([A-Z]{3})\/KHR\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*<\/td>\s*<td[^>]*>\s*[\d.,]+\s*<\/td>\s*<td[^>]*>\s*[\d.,]+\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/g
  for (const m of text.matchAll(row)) {
    const unit = Number(m[2].replace(/,/g, ""))
    const average = Number(m[3].replace(/,/g, ""))
    if (unit > 0 && average > 0) khr_per[m[1]] = round(average / unit)
  }
  return { date, usd_khr: usd, khr_per }
}
