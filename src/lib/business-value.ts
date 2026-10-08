import { currentValue, type PhysicalAsset } from "@/lib/assets"
import type { Debt, Wallet } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { personalWallets } from "@/lib/pool-ledger"
import { convert, roundMoney } from "@/lib/money"

/**
 * A business's asset-based value in USD, at the app rate:
 *
 *   cash (positive wallet balances: ACLEDA, ABA, cash…)
 * + equipment (fixed assets at today's depreciated book value; premises at the estimate)
 * + stock on hand (the owner's STOCK figure)
 * − overdraft (wallets below zero, credit cards owed)
 * − loans (what is still owed on the debts the business pays back)
 *
 * Money customers owe (receivables) is not counted. Pure.
 */
export function businessValue(
  wallets: Pick<Wallet, "balance" | "currency" | "archived_at" | "icon">[],
  assets: PhysicalAsset[],
  debts: Pick<Debt, "type" | "total_amount" | "paid_amount" | "currency">[],
  khrPerUsd: number,
  today?: string,
) {
  const usd = (n: number, currency: "USD" | "KHR") => convert(n, currency, "USD", khrPerUsd)
  // A shared pool's wallet holds the group's money, not the business's.
  const live = personalWallets(wallets).filter((w) => !w.archived_at)
  const cash = live.reduce((s, w) => s + (w.balance > 0 ? usd(w.balance, w.currency) : 0), 0)
  // Overdraft and cards owed: every balance below zero.
  const overdraft = live.reduce((s, w) => s + (w.balance < 0 ? usd(-w.balance, w.currency) : 0), 0)
  const equipment = assets.filter((a) => a.kind !== "STOCK").reduce((s, a) => s + usd(currentValue(a, today), a.currency), 0)
  const stock = assets.filter((a) => a.kind === "STOCK").reduce((s, a) => s + usd(a.estimated_value, a.currency), 0)
  const loans = debts.filter((d) => d.type === "PAYABLE").reduce((s, d) => s + usd(remaining(d), d.currency), 0)
  const r = (n: number) => roundMoney(n, "USD")
  return {
    cash: r(cash),
    equipment: r(equipment),
    stock: r(stock),
    overdraft: r(overdraft),
    loans: r(loans),
    total: r(cash + equipment + stock - overdraft - loans),
  }
}
