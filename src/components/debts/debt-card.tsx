"use client"

import Link from "next/link"

import { PartyAvatar } from "@/components/common/party-avatar"
import { Amount } from "@/components/money/amount"
import type { Debt } from "@/lib/data/types"
import { cn } from "@/lib/utils"

import { DebtProgress } from "./debt-progress"
import { InsuredBadge } from "./insurance-card"
import { UrgencyBadge } from "./urgency-badge"

export function DebtCard({ debt, compact }: { debt: Debt; compact?: boolean }) {
  return (
    <Link
      href={`/debts/${debt.id}`}
      className={cn("block space-y-2.5 px-4 py-3 transition-colors hover:bg-muted/60", compact && "space-y-2")}
    >
      <div className="flex items-start gap-3">
        <PartyAvatar name={debt.party_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{debt.party_name}</p>
          {debt.note && !compact && <p className="truncate text-xs text-muted-foreground">{debt.note}</p>}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <UrgencyBadge debt={debt} />
            <InsuredBadge debt={debt} />
          </span>
        </div>
        <Amount value={debt.total_amount} currency={debt.currency} className="text-sm font-semibold" />
      </div>
      <DebtProgress debt={debt} />
    </Link>
  )
}
