"use client"

import { BuildingIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { usePhysicalAssets } from "@/lib/assets-data"
import { businessValue } from "@/lib/business-value"
import type { Debt, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Business home: what the business is worth on its assets — cash + equipment (depreciated)
 * + stock − overdraft − loans — with each part on its own line.
 */
export function BusinessValueCard({ workspaceId, wallets, debts }: { workspaceId: string | undefined; wallets: Wallet[] | undefined; debts: Debt[] | undefined }) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const assets = usePhysicalAssets(workspaceId).data
  const v = useMemo(() => businessValue(wallets ?? [], assets ?? [], debts ?? [], khrPerUsd), [wallets, assets, debts, khrPerUsd])
  if (!wallets) return null

  const rows: { key: string; label: string; value: number; minus?: boolean }[] = [
    { key: "cash", label: t("bizValue.cash"), value: v.cash },
    { key: "equipment", label: t("bizValue.equipment"), value: v.equipment },
    { key: "stock", label: t("bizValue.stock"), value: v.stock },
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
            <span className="text-muted-foreground">{r.label}</span>
            <span className={cn("tabular-nums", r.minus && r.value > 0 && "text-rose-600 dark:text-rose-400")}>
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
