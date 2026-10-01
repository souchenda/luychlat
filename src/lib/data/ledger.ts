import { roundMoney } from "@/lib/money"

import type { Currency, Transaction } from "./types"

/**
 * Amount entered in `currency`, expressed in the wallet's currency.
 * Mirrors public.amount_in_wallet_currency(): rate is KHR per 1 USD.
 */
export function amountInWalletCurrency(
  amount: number,
  currency: Currency,
  khrPerUsd: number | null,
  walletCurrency: Currency,
): number {
  if (currency === walletCurrency) return amount
  if (!khrPerUsd) throw new Error("exchange_rate is required when currency differs from the wallet")
  return roundMoney(currency === "USD" ? amount * khrPerUsd : amount / khrPerUsd, walletCurrency)
}

/**
 * Balance changes a transaction applies to wallets (mirrors the
 * transactions_balance trigger). Multiply by -1 to reverse.
 */
export function walletDeltas(
  tx: Pick<Transaction, "type" | "wallet_id" | "to_wallet_id" | "amount" | "to_amount" | "currency" | "exchange_rate">,
  walletCurrency: (walletId: string) => Currency,
): { walletId: string; delta: number }[] {
  if (tx.type === "TRANSFER") {
    return [
      { walletId: tx.wallet_id, delta: -tx.amount },
      { walletId: tx.to_wallet_id!, delta: tx.to_amount! },
    ]
  }
  const value = amountInWalletCurrency(tx.amount, tx.currency, tx.exchange_rate, walletCurrency(tx.wallet_id))
  return [{ walletId: tx.wallet_id, delta: tx.type === "INCOME" ? value : -value }]
}
