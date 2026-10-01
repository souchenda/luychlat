import { dualTotal, type DualTotal } from "@/lib/analytics"
import { ADJUSTMENT_CATEGORY_PRESETS, DEBT_CATEGORY_PRESETS, DISBURSEMENT_CATEGORY_PRESETS } from "@/lib/categories/presets"
import type { Category, Currency, Transaction } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/**
 * Profit & Loss (cash basis) for a period.
 *
 * - Revenue: income categories except "other_income" and capital injection
 * - COGS: the "inventory" (stock purchases) category
 * - Operating expenses: every other expense category (incl. custom ones)
 * - Other income: "other_income"
 * - Excluded (not profit or loss): transfers, debt principal (borrowed/lent
 *   funds and repayments), owner capital ("investment") and balance adjustments.
 */
export type PlLine = { key: string; category: Category | null; total: DualTotal }

export type ProfitAndLoss = {
  revenue: DualTotal
  revenueLines: PlLine[]
  cogs: DualTotal
  cogsLines: PlLine[]
  grossProfit: DualTotal
  opex: DualTotal
  opexLines: PlLine[]
  otherIncome: DualTotal
  netProfit: DualTotal
  /** Percent of revenue, or null without revenue. */
  grossMargin: number | null
  netMargin: number | null
  /** Money movements left out of the P&L, for transparency. */
  excluded: { capital: DualTotal; debtFlows: DualTotal; adjustments: DualTotal }
  transactionCount: number
}

const COGS_KEYS = new Set(["inventory"])
const OTHER_INCOME_KEYS = new Set(["other_income"])
const CAPITAL_KEYS = new Set(["investment"])
const ADJUSTMENT_KEYS = new Set(Object.values(ADJUSTMENT_CATEGORY_PRESETS).map((p) => p.key))
const DEBT_FLOW_KEYS = new Set([
  ...Object.values(DEBT_CATEGORY_PRESETS).map((p) => p.key),
  ...Object.values(DISBURSEMENT_CATEGORY_PRESETS).map((p) => p.key),
])

type Bucket = { USD: number; KHR: number }
const empty = (): Bucket => ({ USD: 0, KHR: 0 })

function add(map: Map<string, Bucket>, key: string, currency: Currency, amount: number) {
  const bucket = map.get(key) ?? empty()
  bucket[currency] += amount
  map.set(key, bucket)
}

export function profitAndLoss(transactions: Transaction[], categories: Category[], khrPerUsd: number): ProfitAndLoss {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const revenue = new Map<string, Bucket>()
  const cogs = new Map<string, Bucket>()
  const opex = new Map<string, Bucket>()
  const other = new Map<string, Bucket>()
  const capital = empty()
  const debtFlows = empty()
  // Net effect of adjustments (+ in, − out).
  const adjustments = empty()
  let count = 0

  for (const tx of transactions) {
    if (tx.type === "TRANSFER") continue
    const category = tx.category_id ? byId.get(tx.category_id) : undefined
    const preset = category?.preset_key ?? ""
    const key = category?.id ?? "uncategorized"
    if (DEBT_FLOW_KEYS.has(preset) || tx.debt_id) {
      debtFlows[tx.currency] += tx.amount
      continue
    }
    if (ADJUSTMENT_KEYS.has(preset)) {
      adjustments[tx.currency] += tx.type === "INCOME" ? tx.amount : -tx.amount
      continue
    }
    if (CAPITAL_KEYS.has(preset)) {
      capital[tx.currency] += tx.amount
      continue
    }
    count++
    if (tx.type === "INCOME") add(OTHER_INCOME_KEYS.has(preset) ? other : revenue, key, tx.currency, tx.amount)
    else add(COGS_KEYS.has(preset) ? cogs : opex, key, tx.currency, tx.amount)
  }

  const total = (map: Map<string, Bucket>) => {
    let usd = 0
    let khr = 0
    for (const b of map.values()) {
      usd += b.USD
      khr += b.KHR
    }
    return dualTotal(usd, khr, khrPerUsd)
  }
  const lines = (map: Map<string, Bucket>): PlLine[] =>
    [...map.entries()]
      .map(([key, b]) => ({ key, category: byId.get(key) ?? null, total: dualTotal(b.USD, b.KHR, khrPerUsd) }))
      .sort((a, b) => b.total.usd - a.total.usd)
  const minus = (a: DualTotal, b: DualTotal): DualTotal => ({
    usd: roundMoney(a.usd - b.usd, "USD"),
    khr: roundMoney(a.khr - b.khr, "KHR"),
  })
  const plus = (a: DualTotal, b: DualTotal): DualTotal => ({
    usd: roundMoney(a.usd + b.usd, "USD"),
    khr: roundMoney(a.khr + b.khr, "KHR"),
  })

  const revenueTotal = total(revenue)
  const cogsTotal = total(cogs)
  const grossProfit = minus(revenueTotal, cogsTotal)
  const opexTotal = total(opex)
  const otherIncome = total(other)
  const netProfit = plus(minus(grossProfit, opexTotal), otherIncome)
  const margin = (n: DualTotal) => (revenueTotal.usd > 0 ? Math.round((n.usd / revenueTotal.usd) * 1000) / 10 : null)

  return {
    revenue: revenueTotal,
    revenueLines: lines(revenue),
    cogs: cogsTotal,
    cogsLines: lines(cogs),
    grossProfit,
    opex: opexTotal,
    opexLines: lines(opex),
    otherIncome,
    netProfit,
    grossMargin: margin(grossProfit),
    netMargin: margin(netProfit),
    excluded: {
      capital: dualTotal(capital.USD, capital.KHR, khrPerUsd),
      debtFlows: dualTotal(debtFlows.USD, debtFlows.KHR, khrPerUsd),
      adjustments: dualTotal(adjustments.USD, adjustments.KHR, khrPerUsd),
    },
    transactionCount: count,
  }
}
