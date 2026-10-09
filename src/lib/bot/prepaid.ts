/**
 * Top-ups of a prepaid wallet ("ថប់អាប់សាកឡាន 50$ ABA", "ថប់អាប់ល្បឿនលឿន 30$ ABA") and
 * the /car report. A top-up is a transfer from the source wallet: nothing is spent until
 * the charging / toll is deducted. Pure (prepaid.test.ts).
 */

import { roundToNearest100KHR } from "@/lib/currency"
import { formatMoney } from "@/lib/money"

import { findWallet, parseAmountText, toLatinDigits, type BotWallet } from "./parse-entry"
import { isPrepaidIcon, PREPAID_ICON, PREPAID_NAME, prepaidTypeOf, type PrepaidType } from "./prepaid-kind"

export * from "./prepaid-kind"

const TOPUP = /^\s*(?:ថប់អាប់|ថបអាប់|ថប់អប់|តប់អាប់|top\s*-?\s*up|បញ្ចូលលុយ|បញ្ចូលប្រាក់)/i

export type TopUp =
  | { ok: true; type: PrepaidType; amount: number; currency: "USD" | "KHR"; source: BotWallet; target: BotWallet | null; note: string }
  | { ok: false; reason: "no_amount" | "no_wallet" }

/** A top-up message, or null when the message isn't one. */
export function parseTopUp(message: string, wallets: BotWallet[]): TopUp | null {
  const text = toLatinDigits(message).toLowerCase().trim()
  if (!TOPUP.test(text)) return null
  const type = prepaidTypeOf(text)
  if (!type) return null
  const amount = parseAmountText(toLatinDigits(message))
  if (!amount) return { ok: false, reason: "no_amount" }
  const sources = wallets.filter((w) => !isPrepaidIcon(w.icon) && w.kind !== "CREDIT_CARD")
  // The paying wallet named in the message ("… ABA"), else the first in the amount's currency.
  const source = findWallet(text, sources) ?? (amount.currency && sources.find((w) => w.currency === amount.currency)) ?? sources[0]
  if (!source) return { ok: false, reason: "no_wallet" }
  const currency = amount.currency ?? "USD"
  return {
    ok: true,
    type,
    amount: currency === "USD" ? Math.round(amount.value * 100) / 100 : Math.round(amount.value),
    currency,
    source,
    target: wallets.find((w) => w.icon === PREPAID_ICON[type]) ?? null,
    note: message.replace(/\s+/g, " ").trim().slice(0, 200),
  }
}

/** The confirm card's text for a top-up. */
export function topUpCard(t: Extract<TopUp, { ok: true }>): string {
  return [
    `🔁 ថប់អាប់${t.type === "EV" ? "កាបូបសាកឡាន" : "កាបូបផ្លូវល្បឿនលឿន"}`,
    `💵 ${formatMoney(t.amount, t.currency)}`,
    `🏦 ពី៖ ${t.source.name}`,
    `➡️ ទៅ៖ ${t.target?.name ?? `${PREPAID_NAME[t.type]} (បង្កើតថ្មី)`}`,
    "ℹ️ ជាការផ្ទេរប្រាក់ — មិនទាន់គិតជាការចំណាយទេ រហូតដល់សាក ឬឆ្លងផ្លូវ។",
  ].join("\n")
}

export type CarReport = {
  status: string
  numbers?: boolean
  home_kwh?: number
  home_khr?: number | null
  public_usd?: number
  toll_usd?: number
  ev_balance?: number | null
  toll_balance?: number | null
}

const kwhText = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)

/** /car, /ev — this month. Money lines only when the user opted in to numbers in Telegram. */
export function carReportText(r: CarReport, monthLabel: string): string {
  const kwh = Number(r.home_kwh ?? 0)
  const home = `⚡ ភ្លើងសាកនៅផ្ទះ៖ ${kwhText(kwh)} kWh${r.numbers && r.home_khr != null ? ` (≈ ${formatMoney(roundToNearest100KHR(Number(r.home_khr)), "KHR")})` : ""}`
  const lines = [`🚗 ចំណាយលើឡាន · ${monthLabel}`, "", home]
  if (!r.numbers) {
    lines.push("", "🔒 ចំនួនទឹកប្រាក់ និងសមតុល្យមិនបង្ហាញក្នុង Telegram ទេ — បើក «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» ក្នុងកម្មវិធី › ការកំណត់ › Telegram ដើម្បីមើលនៅទីនេះ។")
    return lines.join("\n")
  }
  lines.push(`🔌 សាកនៅក្រៅ៖ ${formatMoney(Number(r.public_usd ?? 0), "USD")}`, `🛣️ ថ្លៃផ្លូវល្បឿនលឿន៖ ${formatMoney(Number(r.toll_usd ?? 0), "USD")}`)
  if (r.ev_balance != null) lines.push(`💳 សមតុល្យសល់ក្នុងកាបូបសាកឡាន៖ ${formatMoney(Number(r.ev_balance), "USD")}`)
  if (r.toll_balance != null) lines.push(`💳 សមតុល្យសល់ក្នុងកាបូបល្បឿនលឿន៖ ${formatMoney(Number(r.toll_balance), "USD")}`)
  return lines.join("\n")
}

export type WalletBalance = { name: string; currency: "USD" | "KHR"; balance: number; icon: string | null; kind?: string | null }

/** /wallets, /balance (opt-in): every wallet, the prepaid ones marked. */
export function walletBalancesText(wallets: WalletBalance[]): string {
  const mark = (w: WalletBalance) => (w.icon === PREPAID_ICON.EV ? "⚡" : w.icon === PREPAID_ICON.TOLL ? "🛣️" : w.kind === "CREDIT_CARD" ? "💳" : "👛")
  return [
    "👛 សមតុល្យកាបូប",
    "",
    ...(wallets.length ? wallets.map((w) => `${mark(w)} ${w.name} — ${formatMoney(Number(w.balance), w.currency)}`) : ["មិនទាន់មានកាបូបទេ។"]),
    "",
    "🔒 បង្ហាញព្រោះអ្នកបានបើក «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» — បិទវាវិញក្នុងកម្មវិធី › ការកំណត់ › Telegram។",
  ].join("\n")
}
