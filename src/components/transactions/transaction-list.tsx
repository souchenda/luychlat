"use client"

import { format, isToday, isYesterday } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { ArrowRightIcon, CircleCheckIcon, PaperclipIcon } from "lucide-react"

import { CategoryIcon } from "@/components/categories/category-icon"
import { RecordedBy } from "@/components/family/member-avatar"
import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Transaction, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

type TransactionListProps = {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
  onSelect?: (tx: Transaction) => void
  /** Group rows under day headings (ledger view). */
  groupByDay?: boolean
}

export function TransactionList({ transactions, wallets, categories, onSelect, groupByDay }: TransactionListProps) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const walletById = new Map(wallets.map((w) => [w.id, w]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const dateLocale = locale === "km" ? km : enUS

  const dayLabel = (date: Date) => {
    if (isToday(date)) return t("date.today")
    if (isYesterday(date)) return t("date.yesterday")
    return format(date, "EEEE d MMMM yyyy", { locale: dateLocale })
  }

  const row = (tx: Transaction) => {
    const wallet = walletById.get(tx.wallet_id)
    const category = tx.category_id ? categoryById.get(tx.category_id) : undefined
    const date = new Date(tx.transaction_date)
    const isTransfer = tx.type === "TRANSFER"
    const toWallet = tx.to_wallet_id ? walletById.get(tx.to_wallet_id) : undefined

    const title = isTransfer ? (
      <span className="flex items-center gap-1 truncate">
        <span className="truncate">{wallet?.name ?? "—"}</span>
        <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{toWallet?.name ?? "—"}</span>
      </span>
    ) : category ? (
      categoryLabel(category, locale)
    ) : (
      t("entry.uncategorized")
    )
    const subtitle = [
      isTransfer ? t("tx.TRANSFER") : wallet?.name,
      groupByDay ? format(date, "HH:mm") : format(date, "dd/MM"),
      tx.note,
    ]
      .filter(Boolean)
      .join(" · ")

    return (
      <button
        key={tx.id}
        type="button"
        onClick={() => onSelect?.(tx)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <CategoryIcon category={category} transfer={isTransfer} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {tx.reconciled_at && <CircleCheckIcon className="size-3 shrink-0 text-emerald-600" aria-label={t("recon.verified")} />}
            {tx.receipt_url && <PaperclipIcon className="size-3 shrink-0" aria-label={t("entry.receipt")} />}
            <span className="truncate">{subtitle}</span>
          </span>
          <RecordedBy row={tx} className="mt-0.5 flex" />
        </span>
        <span className="text-right">
          <Amount
            value={tx.type === "EXPENSE" ? -tx.amount : tx.amount}
            currency={tx.currency}
            signed={!isTransfer}
            className={cn(
              "block text-sm font-semibold",
              tx.type === "INCOME" && "text-emerald-600 dark:text-emerald-400",
              tx.type === "EXPENSE" && "text-foreground",
            )}
          />
          {isTransfer && toWallet && toWallet.currency !== tx.currency && tx.to_amount !== null && (
            <Amount value={tx.to_amount} currency={toWallet.currency} className="block text-xs text-muted-foreground" />
          )}
        </span>
      </button>
    )
  }

  if (!groupByDay) return <Card className="gap-0 divide-y overflow-hidden py-0">{transactions.map(row)}</Card>

  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = format(new Date(tx.transaction_date), "yyyy-MM-dd")
    groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([key, rows]) => (
        <section key={key} className="space-y-1.5">
          <h3 className="px-1 text-xs font-medium text-muted-foreground">{dayLabel(new Date(rows[0].transaction_date))}</h3>
          <Card className="gap-0 divide-y overflow-hidden py-0">{rows.map(row)}</Card>
        </section>
      ))}
    </div>
  )
}
