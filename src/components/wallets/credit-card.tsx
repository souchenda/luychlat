"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangleIcon, CalendarClockIcon } from "lucide-react"

import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { cardSummary, lastStatementDate, safeUse } from "@/lib/credit-card"
import { useRepo } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, roundMoney } from "@/lib/money"
import { addDays, phnomPenhDate, phnomPenhDayStart, walletEffect } from "@/lib/reconcile/ledger"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { useLocaleStore } from "@/stores/locale-store"

const today = () => phnomPenhDate(new Date().toISOString())

/** Owed, available / limit with a usage bar, next due date, and a warning above 70 %. */
export function CardMeter({ wallet, compact }: { wallet: Wallet; compact?: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const s = cardSummary(wallet, today())
  if (!s) return null
  const pct = Math.min(100, Math.round(s.utilization * 100))
  const money = (n: number) => formatMoney(n, wallet.currency)
  const safe = safeUse(s)
  return (
    <div className={cn("space-y-1.5", compact ? "text-[11px]" : "text-xs")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{t("card.available")}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{money(s.available)}</span>
          <span className="text-muted-foreground"> / {money(s.limit)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("card.used")}>
        <div className={cn("h-full rounded-full", s.high ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.dueDate && s.daysLeft !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              s.daysLeft <= 3 ? "bg-rose-500/12 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClockIcon className="size-3" aria-hidden />
            {s.daysLeft === 0 ? t("card.dueToday") : t("card.dueIn", { duration: formatDuration(s.daysLeft, "remaining", locale) })}
          </span>
        )}
        {s.high && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangleIcon className="size-3" aria-hidden />
            {t("card.highUse", { pct })}
          </span>
        )}
      </div>
      {/* The card's own page: the 30% rule, under the bar (the compact list stays short). */}
      {!compact && (
        <div
          className={cn(
            "rounded-xl border px-3 py-2 leading-relaxed",
            safe.over ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200",
          )}
        >
          {safe.over ? (
            <>
              <p>{t("card.safeRule", { safe: money(safe.safeLimit) })}</p>
              <p className="mt-1 font-medium">{t("card.safeOver", { excess: money(safe.excess), safe: money(safe.safeLimit) })}</p>
            </>
          ) : (
            <p>{t("card.safeOk", { safe: money(safe.safeLimit) })}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * "Pay credit card": a transfer from a wallet into the card, so the bill is
 * never counted as spending a second time. Offers the statement balance (what's
 * due by the due date) and the full balance.
 */
export function PayCardSheet({ open, onOpenChange, card, wallets }: { open: boolean; onOpenChange: (open: boolean) => void; card: Wallet; wallets: Wallet[] }) {
  const t = useT()
  const { repo, scope } = useRepo()
  const owed = Math.max(0, -card.balance)
  const statement = card.statement_day ? lastStatementDate(card.statement_day, today()) : null
  // Activity after the bill closed isn't due yet: take it back out.
  const after = useQuery({
    queryKey: ["transactions", scope, card.workspace_id, "card-statement", card.id, statement],
    enabled: open && Boolean(statement),
    queryFn: () => repo.listTransactions(card.workspace_id, { walletId: card.id, from: phnomPenhDayStart(addDays(statement!, 1)) }),
  })
  const sinceStatement = (after.data ?? []).reduce((sum, x) => sum + walletEffect(x, card), 0)
  const statementOwed = roundMoney(Math.max(0, Math.min(owed, -(card.balance - sinceStatement))), card.currency)

  const choices = [
    ...(after.isSuccess && statementOwed > 0 && statementOwed !== owed ? [{ label: t("card.statementBalance"), amount: statementOwed }] : []),
    { label: t("card.fullBalance"), amount: owed },
  ]
  return (
    <TransferSheet
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={card.workspace_id}
      wallets={wallets}
      initialTo={card.id}
      title={t("card.pay")}
      amountChoices={owed > 0 ? choices : undefined}
    />
  )
}
