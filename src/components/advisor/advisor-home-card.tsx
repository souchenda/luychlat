"use client"

import { ChevronRightIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { insights } from "@/lib/advisor/engine"
import { scoreBand } from "@/lib/advisor/snapshot"
import { useAdvisorSnapshot } from "@/lib/advisor/use-snapshot"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"

import { InsightList, ScoreRing } from "./advisor-widgets"

/** Dashboard teaser: health score and the two most important insights. */
export function AdvisorHomeCard() {
  const t = useT()
  const lang = useLocaleStore((s) => s.locale)
  const { snapshot, labels, loading } = useAdvisorSnapshot()
  const top = useMemo(() => {
    if (!snapshot || !labels) return []
    const rank = { critical: 0, warn: 1, info: 2, good: 3 }
    return insights(snapshot, labels, lang)
      .filter((i) => i.id !== "start") // onboarding tip: kept on /advisor, not on Home
      .sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [snapshot, labels, lang])

  if (loading || !snapshot) return <Skeleton className="h-40 w-full rounded-xl" />

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <SparklesIcon className="size-4" aria-hidden />
          {t("advisor.title")}
        </h2>
        <Link href="/advisor" className="flex items-center text-sm text-primary">
          {t("advisor.open")}
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
      <Card className="gap-3 px-4 py-4">
        <Link href="/advisor" className="flex items-center gap-3">
          <ScoreRing score={snapshot.score} className="size-14" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{t("score.title")}</p>
            <p className="font-semibold">{t(`advisor.band.${scoreBand(snapshot.score)}`)}</p>
          </div>
          <SparklesIcon className="size-6 text-primary" aria-hidden />
        </Link>
        <InsightList insights={top} limit={2} />
      </Card>
    </section>
  )
}
