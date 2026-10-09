/**
 * Instant feedback when EV charging is logged (founder, 09/10): this session's cost and the
 * month so far. Home charging is costed from the electricity rate (the latest scanned bill's
 * riel per kWh, else 730៛) — an estimate, nothing taken from a wallet. Public charging shows
 * the month's spending only with numbers opted in (no-balances-in-chat rule). Pure
 * (ev-summary.test.ts).
 */

import { formatMoney } from "@/lib/money"

/** Riel per kWh when no electricity bill with a rate has been scanned yet. */
export const DEFAULT_KWH_RATE = 730

const kwhText = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)
const riel = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n))
const usd = (khr: number, khrPerUsd: number) => formatMoney(Math.round((khr / khrPerUsd) * 100) / 100, "USD")

export type HomeCharge = {
  kwh: number
  /** Riel per kWh used (the bill's, or the default). */
  rate: number
  mtdKwh: number
  mtdCount: number
  khrPerUsd: number
  /** Logged from a photo (kept as evidence). */
  photo?: boolean
}

export const homeCost = (kwh: number, rate: number) => Math.round(kwh * rate)

/** ⚡ … បានកត់ត្រា! — the session's cost and the month's home charging so far. */
export function homeChargeText(h: HomeCharge): string {
  const rate = h.rate > 0 ? h.rate : DEFAULT_KWH_RATE
  const session = homeCost(h.kwh, rate)
  const mtd = homeCost(h.mtdKwh, rate)
  return [
    `⚡ សាកឡាននៅផ្ទះ ${kwhText(h.kwh)} kWh បានកត់ត្រា!${h.photo ? " (ភ្ជាប់ជាមួយរូបភាពភស្តុតាង)" : ""}`,
    `💵 ថ្លៃភ្លើងលើកនេះ៖ ${riel(session)} ៛ (≈ ${usd(session, h.khrPerUsd)})`,
    `   (គណនាតាមថ្លៃភ្លើង ${riel(rate)}៛/kWh)`,
    "",
    "📊 សរុបសាកឡាននៅផ្ទះខែនេះ៖",
    `• ថាមពលសរុប៖ ${kwhText(h.mtdKwh)} kWh`,
    `• ថ្លៃភ្លើងសរុប៖ ${riel(mtd)} ៛ (≈ ${usd(mtd, h.khrPerUsd)}) • ${h.mtdCount} ដង`,
    "(ចំណាំ៖ មិនកាត់លុយចេញពីកាបូបទេ ព្រោះរាប់ក្នុងថ្លៃភ្លើងផ្ទះស្រាប់)",
  ].join("\n")
}

export type VehicleMonth = {
  numbers: boolean
  /** USD paid at public stations this month. */
  publicUsd: number
  homeKwh: number
  rate: number
  khrPerUsd: number
  /** The EV prepaid wallet's balance (shown only with numbers on). */
  evBalance: number | null
}

/** After a public charge: the month's vehicle energy — money lines only with numbers opted in. */
export function publicChargeSummary(session: { amount: number; currency: "USD" | "KHR" }, m: VehicleMonth): string {
  const lines = [`🔌 សាកឡាននៅក្រៅលើកនេះ៖ ${formatMoney(session.amount, session.currency)}`]
  const homeKhr = homeCost(m.homeKwh, m.rate > 0 ? m.rate : DEFAULT_KWH_RATE)
  const homeUsd = Math.round((homeKhr / m.khrPerUsd) * 100) / 100
  if (!m.numbers) {
    lines.push(`📊 ខែនេះ សាកនៅផ្ទះ៖ ${kwhText(m.homeKwh)} kWh`, "🔒 បើក «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» ក្នុងកម្មវិធី › ការកំណត់ › Telegram ដើម្បីមើលចំណាយសរុប និងសមតុល្យកាបូបនៅទីនេះ។")
    return lines.join("\n")
  }
  if (m.evBalance !== null) lines.push(`💳 សមតុល្យសល់ក្នុងកាបូបសាកឡាន៖ ${formatMoney(m.evBalance, "USD")}`)
  lines.push(
    "",
    "📊 ថាមពលយានយន្តខែនេះ៖",
    `• សាកនៅក្រៅ៖ ${formatMoney(m.publicUsd, "USD")}`,
    `• សាកនៅផ្ទះ៖ ${kwhText(m.homeKwh)} kWh (≈ ${formatMoney(homeUsd, "USD")})`,
    `• សរុប៖ ${formatMoney(Math.round((m.publicUsd + homeUsd) * 100) / 100, "USD")}`,
  )
  return lines.join("\n")
}
