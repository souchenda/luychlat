"use client"

import { ChevronDownIcon, ChevronRightIcon, PlusIcon, UsersRoundIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { canWrite, useActiveWorkspace, useTontinePayments, useTontines } from "@/lib/data/hooks"
import type { Tontine } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { byNextDue, tontineProgress, type TontineProgress } from "@/lib/tontine"
import { cn } from "@/lib/utils"

import { TontineFormSheet } from "./tontine-form-sheet"
import { formatDuration } from "@/lib/format"
import { useLocaleStore } from "@/stores/locale-store"

const fmtDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

export function TontineStatusPill({ dead, complete, className }: { dead: boolean; complete: boolean; className?: string }) {
  const t = useT()
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        complete
          ? "bg-muted text-muted-foreground"
          : dead
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {t(complete ? "tontine.complete" : dead ? "tontine.dead" : "tontine.live")}
    </span>
  )
}

/** "In 3 days" / "Today" / "2 days late" for the next round. */
export function DueText({ p, className }: { p: TontineProgress; className?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  if (p.daysLeft === null || !p.nextDate) return null
  const late = p.daysLeft < 0
  return (
    <span className={cn("tabular-nums", late ? "text-[#F43F5E]" : p.daysLeft <= 2 ? "text-amber-600" : "text-muted-foreground", className)}>
      {late
        ? t("tontine.overdue", { duration: formatDuration(-p.daysLeft, "overdue", locale) })
        : p.daysLeft === 0
          ? t("tontine.dueToday")
          : t("tontine.dueIn", { duration: formatDuration(p.daysLeft, "remaining", locale), date: fmtDate(p.nextDate) })}
    </span>
  )
}

function TontineRow({ tontine, p }: { tontine: Tontine; p: TontineProgress }) {
  const t = useT()
  return (
    <Link href={`/debts/tontine/${tontine.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
        <UsersRoundIcon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{tontine.name}</span>
          <TontineStatusPill dead={p.dead} complete={p.complete} />
        </span>
        {/* Rounds settled out of total */}
        <span className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="rounded-full bg-[#10B981]" style={{ width: `${(p.settled / tontine.total_rounds) * 100}%` }} />
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">{t("tontine.progress", { done: p.settled, total: tontine.total_rounds })}</span>
          {!p.complete && <DueText p={p} className="ml-auto" />}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold tabular-nums">{formatMoney(tontine.share_amount, tontine.currency)}</span>
        <span className="block text-[11px] text-muted-foreground">{t(tontine.frequency === "WEEKLY" ? "tontine.perWeek" : "tontine.perMonth")}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

/** Debts › តុងទីន tab. */
export function TontineList() {
  const t = useT()
  const router = useRouter()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const tontines = useTontines(workspace?.id)
  const paymentsQuery = useTontinePayments(workspace?.id)
  const [formOpen, setFormOpen] = useState(false)

  const rows = useMemo(
    () => (tontines.data ?? []).map((x) => ({ t: x, p: tontineProgress(x, paymentsQuery.data ?? []) })).sort(byNextDue),
    [tontines.data, paymentsQuery.data],
  )
  const open = rows.filter((r) => !r.t.closed_at && !r.p.complete)
  const finished = rows.filter((r) => r.t.closed_at || r.p.complete)

  // This month's commitment: full share per open hand (weekly ≈ ×4).
  const monthly = new Map<string, number>()
  for (const { t: x } of open) monthly.set(x.currency, (monthly.get(x.currency) ?? 0) + x.share_amount * (x.frequency === "WEEKLY" ? 4 : 1))

  return (
    <div className="space-y-4">
      <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">{t("tontine.monthlyCommitment")}</p>
          <p className="text-xs text-muted-foreground">{t("tontine.count", { count: open.length })}</p>
        </div>
        <div className="text-right">
          {monthly.size === 0 ? (
            <span className="text-lg font-semibold tabular-nums">—</span>
          ) : (
            [...monthly].map(([currency, amount]) => (
              <p key={currency} className="text-lg font-semibold tabular-nums">
                {formatMoney(amount, currency as Tontine["currency"])}
              </p>
            ))
          )}
        </div>
      </Card>

      {editable && (
        <Button className="w-full" variant="outline" onClick={() => setFormOpen(true)}>
          <PlusIcon />
          {t("tontine.add")}
        </Button>
      )}

      {tontines.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : open.length === 0 ? (
        <button
          type="button"
          onClick={() => editable && setFormOpen(true)}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
        >
          <UsersRoundIcon className="size-8 text-muted-foreground" />
          <span className="font-medium">{t("tontine.empty")}</span>
          <span className="text-sm text-muted-foreground">{t("tontine.emptyHint")}</span>
        </button>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {open.map(({ t: x, p }) => (
            <TontineRow key={x.id} tontine={x} p={p} />
          ))}
        </Card>
      )}

      {finished.length > 0 && (
        <details className="group space-y-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-1 text-sm font-medium text-muted-foreground">
            {t("tontine.finishedSection")} ({finished.length})
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <Card className="gap-0 divide-y overflow-hidden py-0 opacity-80">
            {finished.map(({ t: x, p }) => (
              <TontineRow key={x.id} tontine={x} p={p} />
            ))}
          </Card>
        </details>
      )}

      <TontineFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspace?.id}
        onCreated={(created) => router.push(`/debts/tontine/${created.id}`)}
      />
    </div>
  )
}
