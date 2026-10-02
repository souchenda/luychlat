"use client"

import { ChevronRightIcon, PiggyBankIcon } from "lucide-react"
import Link from "next/link"

import type { Wallet } from "@/lib/data/types"
import { isGoal } from "@/lib/goals"
import { useT } from "@/lib/i18n/use-t"

import { GoalCard } from "./goal-card"

const PREVIEW = 2

/** Home: progress of the first savings goals (nothing when there are none). */
export function GoalsHomeCard({ wallets }: { wallets: Wallet[] | undefined }) {
  const t = useT()
  const goals = (wallets ?? []).filter((w) => isGoal(w) && !w.archived_at)
  if (!goals.length) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <PiggyBankIcon className="size-4" aria-hidden />
          {t("goals.pageTitle")}
        </h2>
        <Link href="/goals" className="flex items-center text-sm text-primary">
          {t("wallets.seeAll")}
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
      <div className="space-y-2">
        {goals.slice(0, PREVIEW).map((g) => (
          <Link key={g.id} href="/goals" className="block">
            <GoalCard goal={g} compact />
          </Link>
        ))}
      </div>
    </section>
  )
}
