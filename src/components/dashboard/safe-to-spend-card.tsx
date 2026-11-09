"use client"

import { ChevronDownIcon, GaugeIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { cambodiaToday, nextDue, useBills } from "@/lib/bills"
import type { Transaction, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { safeToSpend } from "@/lib/safe-to-spend"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * «ថ្ងៃនេះចាយបាន» (founder, 9/11/2026): one number on Home — the money in hand, less this month's bills and goal
 * savings, over the days left in the month (lib/safe-to-spend). Personal and Family only. One tap shows every part of
 * the sum and what it assumes (no silent guessing). Balances hidden → every amount masked.
 */
export function SafeToSpendCard({ workspaceId, wallets, transactions }: { workspaceId: string | undefined; wallets: Wallet[]; transactions: Transaction[] }) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const billsData = useBills(workspaceId).data
  const [open, setOpen] = useState(false)
  const today = cambodiaToday()

  const r = useMemo(() => {
    const bills = (billsData ?? []).map((b) => ({ id: b.id, title: b.title, amount: b.amount, currency: b.currency, kind: b.kind, is_active: b.is_active, due: nextDue(b) }))
    return safeToSpend({ wallets, bills, transactions, khrPerUsd, today })
  }, [billsData, wallets, transactions, khrPerUsd, today])

  // Nothing to share out yet (no wallet with money in it and nothing to pay): no card.
  if (wallets.length === 0 || (r.cash === 0 && r.bills === 0)) return null

  return (
    <Card className="gap-0 px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-3 text-left">
        <GaugeIcon className={cn("size-5 shrink-0", r.status === "ok" ? "text-primary" : "text-amber-500")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("safe.title")}</span>
          <span className="block text-xs text-muted-foreground">{t("safe.daysLeft", { n: r.daysLeft })}</span>
        </span>
        <span className="text-right">
          <Amount value={r.perDay} currency="USD" className="block text-lg leading-tight font-extrabold" />
          <span className="block text-[11px] text-muted-foreground">
            ≈ <Amount value={r.perDayKhr} currency="KHR" />
          </span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {r.status === "short" && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {t("safe.short")} <Amount value={-r.free} currency="USD" />
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-1.5 border-t pt-2 text-[13px]">
          <Row label={t("safe.cash")} value={r.cash} />
          <Row label={t("safe.bills", { n: r.billItems.length })} value={-r.bills} />
          {r.billItems.slice(0, 5).map((b) => (
            <Row key={b.id} label={`· ${b.title}`} value={-b.usd} muted />
          ))}
          {r.goals > 0 && <Row label={t("safe.goals")} value={-r.goals} />}
          <Row label={t("safe.free")} value={r.free} strong />
          <p className="pt-1 text-[11px] leading-snug text-muted-foreground">{t("safe.note")}</p>
        </div>
      )}
    </Card>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: number; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", muted && "pl-2 text-muted-foreground", strong && "font-semibold")}>
      <span className="min-w-0 truncate">{label}</span>
      <Amount value={value} currency="USD" className="shrink-0" />
    </div>
  )
}
