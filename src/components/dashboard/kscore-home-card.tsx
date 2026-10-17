"use client"

import { ChevronRightIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { Gauge } from "@/components/debts/credit-health-card"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { KSCORE_TIERS, kscoreTier } from "@/lib/kscore"
import { useLatestKScore } from "@/lib/kscore-data"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Home, the Personal workspace only (the K-Score is the person's own — never a business's): CBC's gauge,
 * the score (masked with the balances) and its band; opens the full card on /debts. Nothing until a
 * K-Score was added.
 */
export function KScoreHomeCard() {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const k = useLatestKScore().data
  if (!k) return null
  const tier = KSCORE_TIERS[kscoreTier(k.score)]
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-[15px] font-semibold">
        <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
        {t("kscore.title")}
      </h2>
      <Link href="/debts?tab=PAYABLE#credit-health" className="block">
        <Card className="flex flex-row items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
          <div className="relative w-36 shrink-0">
            <Gauge score={k.score} />
            <p className="absolute inset-x-0 bottom-0 text-center text-2xl leading-none font-extrabold tabular-nums">{hidden ? "****" : k.score}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              {tier.dot} {tier.km}
            </p>
            <p className="text-[13px] text-muted-foreground">{tier.en} · 100–1400</p>
          </div>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Card>
      </Link>
    </section>
  )
}
