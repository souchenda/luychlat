import { currentValue, type PhysicalAsset } from "@/lib/assets"
import type { Debt, Wallet } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { personalWallets } from "@/lib/pool-ledger"
import { convert, roundMoney } from "@/lib/money"

/** An inventory purchase (an expense in the business's "inventory" category). */
export type InventoryPurchase = { amount: number; currency: "USD" | "KHR"; date: string }

/**
 * Stock on hand, periodic method: the last physical count (the STOCK entries; the
 * count's date is kept as their purchase_date) plus the inventory bought after it.
 * Without a count yet: what was bought since the 1st of this month.
 */
export function stockOnHand(assets: PhysicalAsset[], purchases: InventoryPurchase[], khrPerUsd: number, today: string) {
  const usd = (n: number, currency: "USD" | "KHR") => convert(n, currency, "USD", khrPerUsd)
  const counts = assets.filter((a) => a.kind === "STOCK" && a.status !== "DISPOSED")
  const countedOn = counts.map((a) => a.purchase_date).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
  const counted = counts.reduce((s, a) => s + usd(a.estimated_value, a.currency), 0)
  const since = countedOn ?? `${today.slice(0, 8)}01`
  const bought = purchases.filter((p) => (countedOn ? p.date > countedOn : p.date >= since)).reduce((s, p) => s + usd(p.amount, p.currency), 0)
  return { value: roundMoney(counted + bought, "USD"), counted: roundMoney(counted, "USD"), bought: roundMoney(bought, "USD"), countedOn, since }
}

/**
 * A business's asset-based value in USD, at the app rate:
 *
 *   cash (positive wallet balances: ACLEDA, ABA, cash…)
 * + equipment (fixed assets at today's depreciated book value; premises at the estimate)
 * + stock on hand (last count + inventory bought since — stockOnHand)
 * − overdraft (wallets below zero)
 * − loans (what is still owed on the debts the business pays back)
 *
 * Money customers owe (receivables) is not counted. Pure.
 */
export function businessValue(
  wallets: Pick<Wallet, "balance" | "currency" | "archived_at" | "icon">[],
  assets: PhysicalAsset[],
  debts: Pick<Debt, "type" | "total_amount" | "paid_amount" | "currency">[],
  khrPerUsd: number,
  today: string,
  purchases: InventoryPurchase[] = [],
) {
  const usd = (n: number, currency: "USD" | "KHR") => convert(n, currency, "USD", khrPerUsd)
  // A shared pool's wallet holds the group's money, not the business's.
  const live = personalWallets(wallets).filter((w) => !w.archived_at)
  const cash = live.reduce((s, w) => s + (w.balance > 0 ? usd(w.balance, w.currency) : 0), 0)
  // Overdraft: every balance below zero.
  const overdraft = live.reduce((s, w) => s + (w.balance < 0 ? usd(-w.balance, w.currency) : 0), 0)
  const equipment = assets.filter((a) => a.kind !== "STOCK").reduce((s, a) => s + usd(currentValue(a, today), a.currency), 0)
  const stock = stockOnHand(assets, purchases, khrPerUsd, today)
  const loans = debts.filter((d) => d.type === "PAYABLE").reduce((s, d) => s + usd(remaining(d), d.currency), 0)
  const r = (n: number) => roundMoney(n, "USD")
  return {
    cash: r(cash),
    equipment: r(equipment),
    stock: stock.value,
    stockDetail: stock,
    overdraft: r(overdraft),
    loans: r(loans),
    total: r(cash + equipment + stock.value - overdraft - loans),
  }
}
