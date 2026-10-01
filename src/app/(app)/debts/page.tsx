"use client"

import { ArrowDownLeftIcon, ArrowUpRightIcon, CalculatorIcon, ChevronDownIcon, HandshakeIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

import { DebtCard } from "@/components/debts/debt-card"
import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { OutstandingAmount } from "@/components/debts/debt-summary"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { canWrite, useActiveWorkspace, useDebts } from "@/lib/data/hooks"
import type { DebtType } from "@/lib/data/types"
import { byUrgency, debtStatus } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"

function DebtsView() {
  const t = useT()
  const params = useSearchParams()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const debtsQuery = useDebts(workspace?.id)
  const [tab, setTab] = useState<DebtType>(params.get("tab") === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE")
  const [formOpen, setFormOpen] = useState(false)

  const ofType = useMemo(() => (debtsQuery.data ?? []).filter((d) => d.type === tab), [debtsQuery.data, tab])
  const open = useMemo(() => ofType.filter((d) => debtStatus(d) !== "SETTLED").sort(byUrgency), [ofType])
  const settled = useMemo(() => ofType.filter((d) => debtStatus(d) === "SETTLED"), [ofType])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t("debts.title")}</h1>
        <div className="flex gap-1.5">
          <Button asChild size="sm" variant="outline">
            <Link href="/debts/calculator">
              <CalculatorIcon />
              {t("loan.short")}
            </Link>
          </Button>
          {editable && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <HandshakeIcon />
              {t("debts.add")}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DebtType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="PAYABLE">
            <ArrowUpRightIcon className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden />
            {t("debts.PAYABLE")}
          </TabsTrigger>
          <TabsTrigger value="RECEIVABLE">
            <ArrowDownLeftIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {t("debts.RECEIVABLE")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="flex-row items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">{t("debts.totalRemaining")}</p>
          <p className="text-xs text-muted-foreground">{t("debts.count", { count: open.length })}</p>
        </div>
        <OutstandingAmount debts={ofType} className="text-right" />
      </Card>

      {debtsQuery.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : open.length === 0 ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
        >
          <HandshakeIcon className="size-8 text-muted-foreground" />
          <span className="font-medium">{t(`debts.empty${tab}`)}</span>
          <span className="text-sm text-muted-foreground">{t("debts.emptyHint")}</span>
        </button>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {open.map((d) => (
            <DebtCard key={d.id} debt={d} />
          ))}
        </Card>
      )}

      {settled.length > 0 && (
        <details className="group space-y-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-1 text-sm font-medium text-muted-foreground">
            {t("debts.settledSection")} ({settled.length})
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <Card className="gap-0 divide-y overflow-hidden py-0 opacity-80">
            {settled.map((d) => (
              <DebtCard key={d.id} debt={d} compact />
            ))}
          </Card>
        </details>
      )}

      <DebtFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={workspace?.id} defaultType={tab} />
    </div>
  )
}

export default function DebtsPage() {
  return (
    <Suspense>
      <DebtsView />
    </Suspense>
  )
}
