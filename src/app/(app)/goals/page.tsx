"use client"

import { PlanningTabs } from "@/components/layout/planning-tabs"
import { PiggyBankIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { GoalCard } from "@/components/goals/goal-card"
import { GoalFormSheet } from "@/components/goals/goal-form-sheet"
import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { canWrite, useActiveWorkspace, useWallets } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { isGoal } from "@/lib/goals"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

/** Savings goals: savings pots filled by transfers from your wallets (net worth stays the same). */
export default function GoalsPage() {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const walletsQuery = useWallets(ws)
  const wallets = useMemo(() => walletsQuery.data ?? [], [walletsQuery.data])
  const goals = wallets.filter((w) => isGoal(w) && !w.archived_at)
  const archived = wallets.filter((w) => isGoal(w) && w.archived_at)
  const totalUsd = roundMoney(
    goals.reduce((sum, g) => sum + (g.currency === "USD" ? g.balance : convert(g.balance, "KHR", "USD", khrPerUsd)), 0),
    "USD",
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [move, setMove] = useState<{ goal: Wallet; dir: "in" | "out" } | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const openForm = (goal: Wallet | null) => {
    setEditing(goal)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <PlanningTabs active="goals" />
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <PiggyBankIcon className="size-5 text-primary" aria-hidden />
          {t("goals.pageTitle")}
        </h1>
        {editable && (
          <Button size="sm" onClick={() => openForm(null)}>
            <PlusIcon />
            {t("goals.new")}
          </Button>
        )}
      </div>

      {goals.length > 0 && (
        <Card className="gap-1 bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-4 text-white">
          <p className="text-sm text-white/80">{t("goals.totalSaved")}</p>
          <Amount value={totalUsd} currency="USD" className="text-2xl font-bold" />
          <p className="text-xs text-white/75">{t("goals.assetNote")}</p>
        </Card>
      )}

      {walletsQuery.isLoading ? (
        <Skeleton className="h-44 w-full rounded-xl" />
      ) : goals.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <span className="text-4xl" aria-hidden>
            🐷
          </span>
          <p className="font-medium">{t("goals.empty")}</p>
          <p className="text-sm text-muted-foreground">{t("goals.howItWorks")}</p>
          {editable && (
            <Button onClick={() => openForm(null)}>
              <PlusIcon />
              {t("goals.new")}
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={editable ? () => openForm(g) : undefined}
              onDeposit={editable ? () => setMove({ goal: g, dir: "in" }) : undefined}
              onWithdraw={editable ? () => setMove({ goal: g, dir: "out" }) : undefined}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="px-1 text-sm text-primary" onClick={() => setShowArchived((v) => !v)}>
            {t("goals.archived", { count: archived.length })}
          </button>
          {showArchived && archived.map((g) => <GoalCard key={g.id} goal={g} onEdit={editable ? () => openForm(g) : undefined} />)}
        </div>
      )}

      <GoalFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={ws} goal={editing} />
      <TransferSheet
        open={move !== null}
        onOpenChange={(open) => !open && setMove(null)}
        workspaceId={ws}
        wallets={wallets}
        initialTo={move?.dir === "in" ? move.goal.id : undefined}
        initialFrom={move?.dir === "out" ? move.goal.id : undefined}
        title={move ? t(move.dir === "in" ? "goals.depositTitle" : "goals.withdrawTitle", { name: move.goal.name }) : undefined}
      />
    </div>
  )
}
