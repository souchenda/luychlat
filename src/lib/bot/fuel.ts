/**
 * Fuel and gas prices (MoC, per 10-day cycle) as chat text — for /fuel, /gas,
 * the community bulletin and /market. Pure. In Khmer, numbers use Khmer digits:
 *
 *   ⛽ តម្លៃប្រេងឥន្ធនៈ & ហ្កាស (MoC ០១–១០ តុលា)៖
 *   • សាំងធម្មតា (EA92) ៖ ៤,១៥០ ៛/លីត្រ
 */
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import type { FuelPrices } from "@/lib/market-calc"

type T = (key: MessageKey, params?: Record<string, string | number>) => string

const KM_DIGITS = "០១២៣៤៥៦៧៨៩"
const kmDigits = (s: string) => s.replace(/\d/g, (d) => KM_DIGITS[Number(d)])
const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "០១–១០ តុលា" / "01–10 Oct" / "10月01–10日" (both months when the cycle crosses one). */
function cycleText(from: string, to: string, locale: Locale): string {
  const [, fm, fd] = from.split("-").map(Number)
  const [, tm, td] = to.split("-").map(Number)
  const p = (n: number) => String(n).padStart(2, "0")
  if (locale === "km") return kmDigits(fm === tm ? `${p(fd)}–${p(td)} ` : `${p(fd)} ${KM_MONTHS[fm - 1]} – ${p(td)} `) + KM_MONTHS[tm - 1]
  if (locale === "zh") return fm === tm ? `${tm}月${p(fd)}–${p(td)}日` : `${fm}月${p(fd)}日–${tm}月${p(td)}日`
  return fm === tm ? `${p(fd)}–${p(td)} ${EN_MONTHS[tm - 1]}` : `${p(fd)} ${EN_MONTHS[fm - 1]} – ${p(td)} ${EN_MONTHS[tm - 1]}`
}

export function fuelLines(fuel: FuelPrices, t: T, today: string, locale: Locale): string[] {
  const num = (n: number) => {
    const s = new Intl.NumberFormat("en-US").format(n)
    return locale === "km" ? kmDigits(s) : s
  }
  const perL = t("fuel.perL")
  const sep = locale === "km" ? " ៖" : ":"
  const lines = [
    t("fuel.title", { range: cycleText(fuel.from, fuel.to, locale) }),
    `• ${t("fuel.regular")}${sep} ${num(fuel.regular)} ${perL}`,
    `• ${t("fuel.super")}${sep} ${num(fuel.super)} ${perL}`,
    `• ${t("fuel.diesel")}${sep} ${num(fuel.diesel)} ${perL}`,
  ]
  if (fuel.lpg) lines.push(`• ${t("fuel.lpg")}${sep} ${num(fuel.lpg)} ${fuel.lpg_unit === "L" ? perL : t("fuel.perKg")}`)
  // An older cycle is still shown, labelled, until the new prices are entered.
  if (fuel.to < today) lines.push(t("fuel.stale"))
  return lines
}
