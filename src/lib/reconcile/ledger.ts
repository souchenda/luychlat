import type { Category, Transaction, Wallet } from "@/lib/data/types"
import { categoryLabel } from "@/lib/categories/presets"

import type { LedgerRow } from "./match"

const PP_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" })

/** yyyy-MM-dd of an ISO timestamp in Phnom Penh. */
export const phnomPenhDate = (iso: string) => PP_DATE.format(new Date(iso))

/** Start of a Phnom Penh day as ISO (UTC+7, no daylight saving). */
export const phnomPenhDayStart = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`).toISOString()

export const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** How much a row moves this wallet, in its currency (mirrors public.wallet_effect). */
export function walletEffect(t: Transaction, wallet: Pick<Wallet, "id" | "currency">): number {
  if (t.type === "TRANSFER") {
    if (t.wallet_id === wallet.id) return -t.amount
    if (t.to_wallet_id === wallet.id) return t.to_amount ?? 0
    return 0
  }
  if (t.wallet_id !== wallet.id) return 0
  let value = t.amount
  if (t.currency !== wallet.currency && t.exchange_rate) {
    value = t.currency === "USD" ? Math.round(t.amount * t.exchange_rate) : Math.round((t.amount / t.exchange_rate) * 100) / 100
  }
  return t.type === "INCOME" ? value : -value
}

export function toLedgerRows(
  transactions: Transaction[],
  wallet: Pick<Wallet, "id" | "currency">,
  categories: Map<string, Category>,
  locale: "km" | "en",
): LedgerRow[] {
  return transactions.map((t) => {
    const category = t.category_id ? categories.get(t.category_id) : undefined
    return {
      id: t.id,
      date: phnomPenhDate(t.transaction_date),
      amount: walletEffect(t, wallet),
      text: [t.note, category ? categoryLabel(category, locale) : ""].filter(Boolean).join(" "),
      bank_ref: t.bank_ref ?? null,
      reconciled: Boolean(t.reconciled_at),
    }
  })
}
