"use client"

import { BuildingIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { localToday } from "@/lib/assets"
import { usePhysicalAssets } from "@/lib/assets-data"
import { businessValue, type InventoryPurchase } from "@/lib/business-value"
import type { Category, Debt, Transaction, Wallet } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { personalTransactions } from "@/lib/pool-ledger"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/** The local YYYY-MM-DD of a transaction's date. */
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Business home: what the business is worth on its assets — cash + equipment (depreciated)
 * + stock (last count + inventory bought since) − overdraft − loans — each part on its own line.
 */
export function BusinessValueCard({
  workspaceId,
  wallets,
  debts,
  transactions,
  categories,
}: {
  workspaceId: string | undefined
  wallets: Wallet[] | undefined
  debts: Debt[] | undefined
  transactions?: Transaction[]
  categories?: Category[]
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const assets = usePhysicalAssets(workspaceId).data
  const today = localToday()
  // Inventory purchases: expenses in the "inventory" category (from the business's own wallets).
  const purchases = useMemo<InventoryPurchase[]>(() => {
    const inventory = new Set((categories ?? []).filter((c) => c.preset_key === "inventory").map((c) => c.id))
    if (!inventory.size) return []
    return personalTransactions(transactions ?? [], wallets ?? [])
      .filter((tx) => tx.type === "EXPENSE" && tx.category_id && inventory.has(tx.category_id))
      .map((tx) => ({ amount: tx.amount, currency: tx.currency, date: localDay(tx.transaction_date) }))
  }, [transactions, categories, wallets])
  const v = useMemo(() => businessValue(wallets ?? [], assets ?? [], debts ?? [], khrPerUsd, today, purchases), [wallets, assets, debts, khrPerUsd, today, purchases])
  if (!wallets) return null

  const ddmm = (iso: string) => {
    const s = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
    return locale === "km" ? khmerDigits(s) : s
  }
  const s = v.stockDetail
  const stockNote = s.countedOn ? t("bizValue.stockCounted", { date: ddmm(s.countedOn) }) : s.bought > 0 ? t("bizValue.stockSince", { date: ddmm(s.since) }) : null

  const rows: { key: string; label: string; note?: string | null; value: number; minus?: boolean }[] = [
    { key: "cash", label: t("bizValue.cash"), value: v.cash },
    { key: "equipment", label: t("bizValue.equipment"), value: v.equipment },
    { key: "stock", label: t("bizValue.stock"), note: stockNote, value: v.stock },
    { key: "overdraft", label: t("bizValue.overdraft"), value: v.overdraft, minus: true },
    { key: "loans", label: t("bizValue.loans"), value: v.loans, minus: true },
  ]

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <span className="flex min-w-0 items-center gap-2">
          <BuildingIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-semibold">{t("bizValue.title")}</span>
        </span>
        <Amount value={v.total} currency="USD" className={cn("text-xl font-bold tabular-nums", v.total < 0 && "text-rose-600 dark:text-rose-400")} />
      </div>
      <div className="space-y-1.5 border-t px-4 py-3 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-muted-foreground">
              {r.label}
              {r.note && <span className="block text-[11px]">{r.note}</span>}
            </span>
            <span className={cn("shrink-0 tabular-nums", r.minus && r.value > 0 && "text-rose-600 dark:text-rose-400")}>
              {r.minus && r.value > 0 ? "−" : ""}
              <Amount value={r.value} currency="USD" />
            </span>
          </div>
        ))}
      </div>
      <Link href="/assets" className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/40">
        <span>{t("bizValue.hint")}</span>
        <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
      </Link>
    </Card>
  )
}
