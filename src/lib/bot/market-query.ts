/**
 * In-chat calculators for the bot: currency (NBC rates) and local gold (CSNJ
 * counter prices), in Khmer, English and Chinese. Pure: the caller passes the
 * stored market data and the message texts.
 *
 *   /rate 100 usd to khr · 100$ to khr · 500000 khr to usd · 100美元换瑞尔
 *   /gold 2 ជី · /gold 5 ជី មាសគ្រឿង · មាស ២ ជី · 金价 2钱 · gold 1 damlung
 *
 * Plain messages are only taken as a question when the whole message is one
 * (amount, currency, "to", currency / gold word and weight, plus words like
 * "how much"), so expenses such as "lunch 5 usd" still go to logging.
 */

import { formatWeight, HUN_GRAMS, HUN_PER_CHI, HUN_PER_DAMLUNG } from "@/lib/gold"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { NBC_CURRENCIES, type MarketLive } from "@/lib/market-calc"

import { khmerWordsToDigits } from "./khmer-numbers"

export type RateQuery = { kind: "rate"; amount: number; from: string; to: string }
export type GoldQuery = { kind: "gold"; hun: number; grams: number | null; type: "kilo" | "jewelry" }
export type MarketQuery = RateQuery | GoldQuery | { kind: "rate_table" } | { kind: "rate_usage" } | { kind: "gold_usage" }

/** Names people use for each currency (lower case). Bare 元 / ¥ are left out: they could be CNY or JPY. */
const CURRENCY_ALIASES: Record<string, string[]> = {
  USD: ["usd", "us$", "$", "dollars", "dollar", "ដុល្លារ", "ដុល្លា", "美元", "美金"],
  KHR: ["khr", "riels", "riel", "៛", "រៀល", "瑞尔", "瑞爾", "柬币"],
  THB: ["thb", "baht", "฿", "បាត", "泰铢", "泰銖"],
  VND: ["vnd", "dong", "₫", "ដុង", "越南盾"],
  CNY: ["cny", "rmb", "yuan", "យាន់", "យន់", "人民币", "人民幣"],
  EUR: ["eur", "euros", "euro", "€", "អឺរ៉ូ", "欧元", "歐元"],
  JPY: ["jpy", "yen", "យ៉េន", "日元", "日圓"],
  KRW: ["krw", "won", "វ៉ុន", "韩元", "韓元"],
  SGD: ["sgd", "新币", "新加坡元"],
  MYR: ["myr", "ringgit", "rm", "រីងហ្គីត", "马币", "令吉"],
  AUD: ["aud", "澳元", "澳币"],
  GBP: ["gbp", "pounds", "pound", "£", "ផោន", "英镑", "英鎊"],
  HKD: ["hkd", "港币", "港元", "港幣"],
}
const ALIAS_TO_CODE = new Map(Object.entries(CURRENCY_ALIASES).flatMap(([code, names]) => names.map((n) => [n, code] as const)))

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** A word in Latin letters must stand alone ("rm" not inside "form"); symbols and Khmer/Chinese words need no edges. */
const alt = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => (/^[a-z]/.test(w) ? `(?<![a-z])${escape(w)}(?![a-z])` : escape(w)))
    .join("|")

const CUR = `(${alt([...ALIAS_TO_CODE.keys()])})`
const NUM = `(\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)\\s*(k|千|万|萬|ពាន់|ម៉ឺន|សែន|លាន|million)?`
const MULTIPLIER: Record<string, number> = { k: 1e3, 千: 1e3, 万: 1e4, 萬: 1e4, ពាន់: 1e3, ម៉ឺន: 1e4, សែន: 1e5, លាន: 1e6, million: 1e6 }
const CONNECTOR = `(?:to|in|into|->|→|=|equals?|ទៅជា|ទៅ|ជា|ស្មើ(?:នឹង)?|换成|换|換成|換|兑换成|兑换|兑成|兑|等于|等於|折合)`
const FILLER = /how much(?: is| are)?|what(?:'s| is)|convert|exchange|rates?|please|today|now|ប៉ុន្មាន|តើ|ប្ដូរ|ដូរ|អត្រា|ស្មើ|ថ្ងៃនេះ|ឥឡូវ|是|多少钱|多少|能换|可以换|请问|汇率|今天|今日|现在/g

// Groups: 1 cur, 2 num, 3 mult | 4 num, 5 mult, 6 cur | 7 connector | 8 target cur
const RATE_RE = new RegExp(`(?:${CUR}\\s*${NUM}|${NUM}\\s*${CUR})\\s*(${CONNECTOR}|多少|ប៉ុន្មាន|how much)?\\s*(?:多少|ប៉ុន្មាន|how much)?\\s*${CUR}?`, "u")

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"
const latinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))
const normalize = (text: string) => latinDigits(khmerWordsToDigits(text.normalize("NFC"))).toLowerCase().replace(/\s+/g, " ").trim()
/** Nothing left but punctuation and spaces. */
const isEmpty = (rest: string) => !/[\p{L}\p{N}]/u.test(rest)

function amountOf(num: string, mult?: string) {
  const n = Number(num.replace(/,/g, ""))
  return Number.isFinite(n) ? n * (mult ? MULTIPLIER[mult] : 1) : NaN
}

function parseRate(text: string, command: boolean): RateQuery | { kind: "rate_table" | "rate_usage" } | null {
  if (command && isEmpty(text.replace(FILLER, " "))) return { kind: "rate_table" }
  const m = text.match(RATE_RE)
  if (!m) return command ? { kind: "rate_usage" } : null
  const fromAlias = m[1] ?? m[6]
  const amount = m[1] ? amountOf(m[2], m[3]) : amountOf(m[4], m[5])
  const from = ALIAS_TO_CODE.get(fromAlias)!
  const target = m[8] ? ALIAS_TO_CODE.get(m[8])! : null
  const rest = (text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length)).replace(FILLER, " ")
  if (!command) {
    // A plain message must be exactly "<amount> <currency> to <currency>" (with filler words).
    if (!target || !m[7] || !isEmpty(rest)) return null
  } else if (!isEmpty(rest)) {
    return { kind: "rate_usage" }
  }
  if (!(amount > 0) || amount > 1e15) return command ? { kind: "rate_usage" } : null
  const to = target ?? (from === "KHR" ? "USD" : "KHR")
  if (to === from) return command ? { kind: "rate_usage" } : null
  return { kind: "rate", amount, from, to }
}

const UNIT_HUN: [RegExp, number][] = [
  [/^(តម្លឹង|damlungs?|taels?|两|兩)$/, HUN_PER_DAMLUNG],
  [/^(ជី|chis?|钱|錢)$/, HUN_PER_CHI],
  [/^(ហ៊ុន|huns?|分)$/, 1],
  [/^(g|grams?|ក្រាម|克)$/, 1 / HUN_GRAMS],
]
const WEIGHT_RE = /(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(តម្លឹង|damlungs?|taels?|两|兩|ជី|chis?|钱|錢|ហ៊ុន|huns?|分|grams?|g|ក្រាម|克)(?![a-z])/gu
const PRICE_WORD = /តម្លៃ|ថ្លៃ|price|金价|金價|价格|價格/u
const GOLD_WORD = /មាស|(?<![a-z])gold(?![a-z])|黄金|黃金|金价|金價|金/u
const JEWELRY = /មាសគ្រឿង(?:អលង្ការ)?|គ្រឿងអលង្ការ|គ្រឿង|jewel(?:le)?ry|首饰金|首饰|首飾|饰金|金饰/u
const GOLD_WORDS = /មាសគ្រឿង(?:អលង្ការ)?|គ្រឿងអលង្ការ|គ្រឿង|មាសគីឡូ|គីឡូ|មាស|jewel(?:le)?ry|kilo|bar|gold|price|of|for|黄金|黃金|金价|金價|金条|金條|首饰金|首饰|首飾|饰金|金饰|价格|價格|价|價|金|តម្លៃ|ថ្លៃ/gu

function parseGold(text: string, command: boolean): GoldQuery | { kind: "gold_usage" } | null {
  if (!command && !GOLD_WORD.test(text)) return null
  let hun = 0
  let grams: number | null = null
  let parts = 0
  const rest = text
    .replace(WEIGHT_RE, (_, num: string, unit: string) => {
      const n = Number(num.replace(/,/g, ""))
      const per = UNIT_HUN.find(([re]) => re.test(unit))![1]
      hun += n * per
      if (per === 1 / HUN_GRAMS) grams = (grams ?? 0) + n
      parts += 1
      return " "
    })
    .replace(GOLD_WORDS, " ")
    .replace(FILLER, " ")
  if (!isEmpty(rest)) return command ? { kind: "gold_usage" } : null
  if (!parts) {
    // "តម្លៃមាសថ្ងៃនេះ" / "gold price today": the price of 1 damlung.
    if (!command && !PRICE_WORD.test(text)) return null
    hun = HUN_PER_DAMLUNG // "/gold" alone: the price of 1 damlung
  }
  if (!(hun > 0) || hun > 1e7) return command ? { kind: "gold_usage" } : null
  return { kind: "gold", hun: Math.round(hun * 1000) / 1000, grams, type: JEWELRY.test(text) ? "jewelry" : "kilo" }
}

/**
 * A calculator question, or null. `/rate …` and `/gold …` always give a query
 * (or the usage); plain messages only when they are clearly one.
 */
export function parseMarketQuery(raw: string): MarketQuery | null {
  const text = normalize(raw)
  const cmd = text.match(/^\/(rate|gold)(?:@\w+)?(?:\s+|$)/)
  if (cmd) {
    const body = text.slice(cmd[0].length)
    return cmd[1] === "rate" ? parseRate(body, true) : parseGold(body, true)
  }
  if (text.startsWith("/") || text.length > 80) return null
  return parseRate(text, false) ?? parseGold(text, false)
}

// ---------- replies ----------

type T = (key: MessageKey, params?: Record<string, string | number>) => string

const NO_DECIMALS = new Set(["KHR", "VND", "KRW", "JPY"])
const num = (n: number, decimals: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n)
const amountText = (n: number, code: string) => `${num(n, NO_DECIMALS.has(code) ? 0 : 2)} ${code}`
const usd = (n: number) => `$${num(n, n >= 100 ? 0 : 2)}`
const khmerDigits = (s: string) => s.replace(/\d/g, (d) => KHMER_DIGITS[Number(d)])
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "1 USD = 4,056 ៛", or per 1,000 / 100 units for small currencies ("1,000 VND = 154 ៛", "100 KRW = 294 ៛"). */
function rateText(code: string, khrPer: number) {
  const unit = khrPer < 1 ? 1000 : khrPer < 10 ? 100 : 1
  const value = khrPer * unit
  return `${num(unit, 0)} ${code} = ${num(value, value >= 100 ? 0 : 2)} ៛`
}

export function rateReply(q: RateQuery, market: MarketLive | null, today: string, t: T): string {
  const khrPer = market?.nbc?.khr_per
  if (!khrPer) return t("bot.rateNone")
  const per = (code: string) => (code === "KHR" ? 1 : khrPer[code])
  if (!per(q.from) || !per(q.to)) return t("bot.rateUnknown", { list: Object.keys(khrPer).concat("KHR").join(", ") })
  const result = (q.amount * per(q.from)) / per(q.to)
  const rates = [q.from, q.to].filter((c) => c !== "KHR").map((c) => rateText(c, per(c)))
  // Always the "As of" day: NBC's rate is for a working day, often tomorrow's or Monday's.
  const date = market.nbc!.date ? ` · ${dayMonth(market.nbc!.date)}` : ""
  return t("bot.rateReply", { from: amountText(q.amount, q.from), to: amountText(result, q.to), rates: rates.join(" · ") + date })
}

/** "/rate" alone: today's NBC rates, then how to convert. */
function rateTable(market: MarketLive | null, today: string, t: T): string {
  const khrPer = market?.nbc?.khr_per
  if (!khrPer) return t("bot.rateNone")
  const lines = NBC_CURRENCIES.filter((c) => khrPer[c]).map((c) => `• ${rateText(c, khrPer[c])}`)
  const date = ` · ${dayMonth(market.nbc!.date)}`
  return `${t("bot.rateTable")}${date}\n${lines.join("\n")}\n\n${t("bot.rateUsage")}`
}

export function goldReply(q: GoldQuery, market: MarketLive | null, lang: Locale, today: string, t: T): string {
  const local = market?.local_gold
  if (!local?.kilo) return t("bot.goldNone")
  const prices = q.type === "jewelry" ? local.jewelry : local.kilo
  if (!prices) return t("bot.goldNoJewelry")
  const damlung = q.hun / HUN_PER_DAMLUNG
  let weight = formatWeight(q.hun, lang)
  if (q.grams !== null) weight = `${num(q.grams, 3)} g · ${weight}`
  const lines = [
    t("bot.goldReply", {
      kind: t(q.type === "jewelry" ? "bot.goldJewelry" : "bot.goldKilo"),
      weight: lang === "km" ? khmerDigits(weight) : weight,
      sell: usd(prices.sell * damlung),
      buy: usd(prices.buy * damlung),
      source: t(local.source === "manual" ? "bot.goldSourceManual" : "bot.goldSourceCsnj"),
      rateSell: usd(prices.sell),
      rateBuy: usd(prices.buy),
    }),
  ]
  if (local.date < today) lines.push(t("bot.marketAsOf", { date: dayMonth(local.date) }))
  return lines.join("\n")
}

/** The reply for a parsed query. */
export function marketQueryReply(q: MarketQuery, market: MarketLive | null, lang: Locale, today: string, t: T): string {
  if (q.kind === "rate_usage") return t("bot.rateUsage")
  if (q.kind === "rate_table") return rateTable(market, today, t)
  if (q.kind === "gold_usage") return t("bot.goldUsage")
  return q.kind === "rate" ? rateReply(q, market, today, t) : goldReply(q, market, lang, today, t)
}
