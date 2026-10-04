/**
 * Understands a short chat message to the official bot ("កាហ្វេ 2$",
 * "ចំណូល ប្រាក់ខែ 800$ ABA", "សង Dara 20$") and turns it into one entry for the
 * user to confirm. Pure (no server or app state), so it is easy to test.
 *
 * Rules, in order:
 *   amount    the first number; $ / usd / ដុល្លារ = USD, ៛ / រៀល / k / ពាន់ /
 *             ម៉ឺន / លាន = KHR (k, ពាន់ ×1,000, ម៉ឺន ×10,000, លាន ×1,000,000).
 *             No marker: the wallet's currency.
 *   kind      "សង" / repay → debt repayment; ចំណូល / ទទួល / ប្រាក់ខែ / income /
 *             a leading "+" → income; anything else → expense.
 *   wallet    a wallet whose name (or a distinctive word of it) is in the
 *             message; "cash" / សាច់ប្រាក់ picks a cash wallet; else the first
 *             wallet in the same currency, else the first wallet.
 *   category  a category named in the message, else keywords → preset.
 *   debt      the open debt whose person is named in the message.
 */

import { convert, roundMoney } from "@/lib/money"

type Currency = "USD" | "KHR"
export type BotWallet = { id: string; name: string; currency: Currency; kind?: string | null }
export type BotCategory = { id: string; name: string; type: "INCOME" | "EXPENSE"; preset_key: string | null }
export type BotDebt = { id: string; type: "PAYABLE" | "RECEIVABLE"; party_name: string; currency: Currency; remaining: number }
export type BotContext = { wallets: BotWallet[]; categories: BotCategory[]; debts: BotDebt[]; rate: number }

export type ParsedEntry =
  | { ok: true; kind: "EXPENSE" | "INCOME"; amount: number; currency: Currency; wallet: BotWallet; category: BotCategory | null; note: string }
  | { ok: true; kind: "REPAY"; amount: number; currency: Currency; wallet: BotWallet; debt: BotDebt; note: string }
  | { ok: false; reason: "no_amount" | "no_wallet" | "no_debt" | "too_much"; debt?: BotDebt }

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"
export const toLatinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))

// Latin words need word edges; Khmer is written without spaces, so it's matched as a substring.
// A Latin word ends at anything that isn't a Latin letter or digit (so "给Dara" and "សងDara" find "Dara").
const edge = (word: string) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "iu")
const isLatin = (w: string) => /^[\x20-\x7e]+$/.test(w)
const has = (text: string, word: string) => (isLatin(word) ? edge(word).test(text) : text.includes(word.toLowerCase()))
const hasAny = (text: string, words: string[]) => words.some((w) => has(text, w))

// "សង" (repay) but not inside words like សង្គម (the coeng ្ follows).
// Chinese: 还款 / 还钱 / 还债, or a message that starts with 还 ("还 Dara 20$").
const REPAY = /សង(?!្)|(^|[^\p{L}])(repay|repaid|pay\s*back|paid\s*back|payback)($|[^\p{L}])|还款|还钱|还债|^\s*还(?=\s|[a-z])/iu
const INCOME_WORDS = ["ចំណូល", "ទទួល", "ប្រាក់ខែ", "លក់បាន", "រកបាន", "income", "salary", "received", "receive", "earned", "sold", "收入", "工资", "薪水", "收到", "进账", "营业额", "奖金"]
const CASH_WORDS = ["cash", "សាច់ប្រាក់", "លុយសុទ្ធ", "ក្នុងហោប៉ៅ", "现金"]
const CASH_WALLET = /cash|សាច់ប្រាក់|លុយ|កាបូប/i
// Too common to identify a wallet on their own ("ABA Bank" → "aba").
const GENERIC = new Set(["bank", "account", "wallet", "card", "usd", "khr", "the", "my", "ធនាគារ", "គណនី", "កាបូប", "ប័ណ្ណ"])

// EV charging. At home it is a usage log (the cost is in the electricity bill);
// at a public station it is a transport expense tagged "⚡ សាកភ្លើង EV".
const EV_WORDS = ["សាកឡាន", "សាកភ្លើង", "សាកថ្ម", "សាកនៅផ្ទះ", "ev", "charging", "充电"]
const HOME_WORDS = ["នៅផ្ទះ", "ផ្ទះ", "home", "在家", "家里", "家充"]
/** kWh figures ("30kwh", "30 គីឡូវ៉ាត់", "30度") — never read as money. */
const KWH = /(\d+(?:[.,]\d+)?)\s*(kwh|kw\/h|គីឡូវ៉ាត់(?:ម៉ោង)?|度)/i
export const EV_TAG = "⚡ សាកភ្លើង EV"

export const isEvCharge = (message: string) => hasAny(toLatinDigits(message).toLowerCase(), EV_WORDS)
/** Charging at home: an EV word with a home word ("សាកឡាននៅផ្ទះ 30kwh", "ev home", "在家充电"). */
export const isEvHome = (message: string) => {
  const text = toLatinDigits(message).toLowerCase()
  return hasAny(text, EV_WORDS) && (text.includes("សាកនៅផ្ទះ") || hasAny(text, HOME_WORDS))
}
/** The kWh in a message, if any. */
export function kwhOf(message: string): number | null {
  const m = toLatinDigits(message).match(KWH)
  const n = m ? Number(m[1].replace(",", ".")) : NaN
  return n > 0 && n <= 500 ? n : null
}

/** Category keywords → preset key; only used when the workspace has that preset. */
const KEYWORDS: { preset: string; words: string[] }[] = [
  { preset: "salary", words: ["ប្រាក់ខែ", "salary", "工资", "薪水"] },
  { preset: "bonus", words: ["រង្វាន់", "bonus"] },
  { preset: "sales", words: ["លក់", "sale", "sales", "sold", "营业额", "卖了", "销售"] },
  { preset: "services", words: ["សេវា", "service"] },
  { preset: "gift_received", words: ["អំណោយ", "gift"] },
  { preset: "side_income", words: ["ចំណូលបន្ថែម", "freelance"] },
  { preset: "food", words: ["កាហ្វេ", "បាយ", "ញ៉ាំ", "ម្ហូប", "អាហារ", "ភេសជ្ជៈ", "នំ", "ទឹកក្រូច", "គុយទាវ", "coffee", "lunch", "dinner", "breakfast", "food", "eat", "drink", "meal", "restaurant", "snack", "咖啡", "早餐", "早饭", "午餐", "午饭", "晚餐", "晚饭", "吃饭", "饭", "餐", "奶茶", "饮料", "外卖", "水果"] },
  { preset: "transport", words: ["សាកឡាន", "សាកភ្លើង", "សាកថ្ម", "ev", "charging", "充电", "សាំង", "ប្រេង", "តុកតុក", "ម៉ូតូ", "ឡាន", "ធ្វើដំណើរ", "ចតឡាន", "grab", "passapp", "tuk", "taxi", "fuel", "gas", "petrol", "bus", "parking", "油费", "汽油", "加油", "打车", "出租车", "停车", "车费", "嘟嘟车"] },
  { preset: "phone", words: ["កាតទូរស័ព្ទ", "ទូរស័ព្ទ", "អ៊ីនធឺណិត", "smart", "cellcard", "metfone", "internet", "phone", "topup", "top up", "话费", "手机", "网费", "流量", "充值"] },
  { preset: "utilities", words: ["ទឹកភ្លើង", "អគ្គិសនី", "electric", "electricity", "edc", "water", "电费", "水费", "水电"] },
  { preset: "housing", words: ["ទឹកភ្លើង", "អគ្គិសនី", "ជួលផ្ទះ", "ផ្ទះ", "rent", "electric", "electricity", "edc", "water", "房租", "电费", "水费", "水电"] },
  { preset: "rent", words: ["ជួល", "rent", "租金", "店租"] },
  { preset: "health", words: ["ពេទ្យ", "ថ្នាំ", "សុខភាព", "doctor", "hospital", "medicine", "pharmacy", "clinic", "医院", "看病", "药", "诊所"] },
  { preset: "education", words: ["សាលា", "រៀន", "សៀវភៅ", "school", "tuition", "book", "course", "学费", "学校", "书", "课程"] },
  { preset: "family", words: ["អំណោយ", "កាដូ", "gift", "family"] },
  { preset: "entertainment", words: ["កុន", "ភាពយន្ត", "កម្សាន្ត", "ហ្គេម", "movie", "cinema", "game", "netflix", "karaoke", "电影", "游戏", "唱歌", "娱乐"] },
  { preset: "shopping", words: ["ទិញឥវ៉ាន់", "ខោអាវ", "ផ្សារ", "shopping", "clothes", "market", "mall", "购物", "衣服", "超市", "市场"] },
  { preset: "inventory", words: ["ស្តុក", "ទំនិញ", "stock", "inventory", "进货", "库存", "货款"] },
  { preset: "payroll", words: ["បៀវត្ស", "payroll", "staff", "员工工资", "人工"] },
  { preset: "marketing", words: ["ផ្សព្វផ្សាយ", "ads", "boost", "marketing"] },
  { preset: "delivery", words: ["ដឹក", "delivery", "shipping", "运费", "快递", "送货"] },
  { preset: "tax", words: ["ពន្ធ", "tax"] },
]

type Amount = { value: number; currency: Currency | null; start: number; end: number }

export function parseAmountText(raw: string): Amount | null {
  const text = toLatinDigits(raw)
  const re = /(\$\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k(?![a-z])|ពាន់|ម៉ឺន|លាន|រៀល|៛|\$|usd(?![a-z])|dollars?(?![a-z])|ដុល្លារ|riels?(?![a-z])|美元|美金|瑞尔|千|万)?/giu
  const candidates: (Amount & { marked: boolean })[] = []
  for (const m of text.matchAll(re)) {
    let digits = m[2]
    // "20,000" is twenty thousand; a lone "2,5" is a decimal comma.
    digits = /,\d{3}(?!\d)/.test(digits) ? digits.replace(/,/g, "") : digits.replace(/,/g, ".")
    let value = Number(digits)
    if (!Number.isFinite(value) || value <= 0) continue
    const unit = (m[3] ?? "").toLowerCase()
    let currency: Currency | null = m[1] ? "USD" : null
    const multiplier = unit === "k" || unit === "ពាន់" || unit === "千" ? 1000 : unit === "ម៉ឺន" || unit === "万" ? 10_000 : unit === "លាន" ? 1_000_000 : 1
    if (multiplier > 1) {
      value *= multiplier
      currency ??= "KHR"
    } else if (unit === "រៀល" || unit === "៛" || unit === "瑞尔" || unit.startsWith("riel")) currency = "KHR"
    else if (unit === "$" || unit === "usd" || unit.startsWith("dollar") || unit === "ដុល្លារ" || unit === "美元" || unit === "美金") currency = "USD"
    let end = m.index! + m[0].length
    // Spoken "ពីរដុល្លារកន្លះ" = $2.50.
    const half = text.slice(end).match(/^\s*កន្លះ/u)
    if (half && currency === "USD" && multiplier === 1) {
      value += 0.5
      end += half[0].length
    }
    const found = { value, currency, start: m.index!, end, marked: Boolean(currency) || multiplier > 1 }
    // A number with a currency or ពាន់ / ម៉ឺន is the amount; otherwise keep looking.
    if (found.marked) return { value: found.value, currency: found.currency, start: found.start, end: found.end }
    candidates.push(found)
  }
  // No marked number: the largest is the price, not a quantity ("ទឹក 1 កេស 6000" → 6000).
  const best = candidates.sort((a, b) => b.value - a.value)[0]
  return best ? { value: best.value, currency: best.currency, start: best.start, end: best.end } : null
}

/** The wallet named in the message (longest match wins). */
function findWallet(text: string, wallets: BotWallet[]): BotWallet | null {
  let best: { wallet: BotWallet; score: number } | null = null
  for (const w of wallets) {
    const name = w.name.toLowerCase().trim()
    const words = name.split(/[\s/·|()-]+/).filter((x) => x.length >= 3 && !GENERIC.has(x))
    for (const candidate of [name, ...words]) {
      if (candidate.length >= 2 && has(text, candidate) && (!best || candidate.length > best.score)) best = { wallet: w, score: candidate.length }
    }
  }
  if (best) return best.wallet
  if (hasAny(text, CASH_WORDS)) return wallets.find((w) => CASH_WALLET.test(w.name)) ?? null
  return null
}

function findCategory(text: string, kind: "INCOME" | "EXPENSE", categories: BotCategory[]): BotCategory | null {
  const own = categories.filter((c) => c.type === kind)
  const named = own
    .filter((c) => c.name.trim().length >= 2 && has(text, c.name.toLowerCase().trim()))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (named) return named
  for (const k of KEYWORDS) {
    const cat = own.find((c) => c.preset_key === k.preset)
    if (cat && hasAny(text, k.words)) return cat
  }
  return own.find((c) => c.preset_key === (kind === "INCOME" ? "other_income" : "other_expense")) ?? null
}

function findDebt(text: string, debts: BotDebt[]): BotDebt | null {
  const incoming = hasAny(text, ["ទទួល", "សងមក", "សងខ្ញុំ", "received", "got", "paid me"])
  const scored = debts
    .map((d) => {
      const name = d.party_name.toLowerCase().trim()
      const words = name.split(/\s+/).filter((x) => x.length >= 2)
      const score = has(text, name) ? name.length + 100 : Math.max(0, ...words.filter((w) => has(text, w)).map((w) => w.length))
      return { d, score: score + (incoming === (d.type === "RECEIVABLE") ? 0.5 : 0) }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.d ?? null
}

export function parseEntry(message: string, ctx: BotContext): ParsedEntry {
  const text = toLatinDigits(message).toLowerCase().trim()
  // "ev 8$ 20kwh": the kWh is not the amount.
  const amount = parseAmountText(toLatinDigits(message).replace(new RegExp(KWH.source, "gi"), " "))
  if (!amount) return { ok: false, reason: "no_amount" }
  if (!ctx.wallets.length) return { ok: false, reason: "no_wallet" }
  const typed = message.replace(/\s+/g, " ").trim()
  // Public EV charging is tagged so it stands out under Transport.
  const note = (isEvCharge(message) && !typed.includes(EV_TAG) ? `${EV_TAG} · ${typed}` : typed).slice(0, 200)
  const named = findWallet(text, ctx.wallets)

  if (REPAY.test(text)) {
    const debt = findDebt(text, ctx.debts)
    if (!debt) return { ok: false, reason: "no_debt" }
    const wallet = named ?? ctx.wallets.find((w) => w.currency === debt.currency && w.kind !== "CREDIT_CARD") ?? ctx.wallets[0]
    // Repayments are kept in the debt's currency.
    const typed = amount.currency ?? wallet.currency
    const value = roundMoney(convert(amount.value, typed, debt.currency, ctx.rate), debt.currency)
    if (value > debt.remaining + 1e-9) return { ok: false, reason: "too_much", debt }
    return { ok: true, kind: "REPAY", amount: value, currency: debt.currency, wallet, debt, note }
  }

  const kind = text.startsWith("+") || hasAny(text, INCOME_WORDS) ? "INCOME" : "EXPENSE"
  const usable = ctx.wallets.filter((w) => kind === "EXPENSE" || w.kind !== "CREDIT_CARD")
  const pool = usable.length ? usable : ctx.wallets
  const wallet = named ?? (amount.currency && pool.find((w) => w.currency === amount.currency)) ?? pool[0]
  const currency = amount.currency ?? wallet.currency
  return {
    ok: true,
    kind,
    amount: roundMoney(amount.value, currency),
    currency,
    wallet,
    category: findCategory(text, kind, ctx.categories),
    note,
  }
}
