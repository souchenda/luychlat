"use client"

import { SettingsIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AdvisorChat } from "@/components/advisor/advisor-chat"
import { InsightList, StrategyCard } from "@/components/advisor/advisor-widgets"
import { CreditScoreCard } from "@/components/advisor/credit-score-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { insights } from "@/lib/advisor/engine"
import { compareStrategies } from "@/lib/advisor/strategy"
import { useAdvisorSnapshot } from "@/lib/advisor/use-snapshot"
import { useT } from "@/lib/i18n/use-t"
import { effectiveProvider, useAiStore } from "@/stores/ai-store"
import { useLocaleStore } from "@/stores/locale-store"

export default function AdvisorPage() {
  const t = useT()
  const lang = useLocaleStore((s) => s.locale)
  const provider = useAiStore((s) => effectiveProvider(s))
  const { snapshot, labels, loading } = useAdvisorSnapshot()
  const list = useMemo(() => (snapshot && labels ? insights(snapshot, labels, lang) : []), [snapshot, labels, lang])
  const strategy = useMemo(() => (snapshot ? compareStrategies(snapshot) : null), [snapshot])
  // "Ask AI how to improve" on the score card is sent through the chat below.
  const [request, setRequest] = useState<{ id: number; text: string } | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          {t("advisor.title")}
        </h1>
          <Badge variant="secondary" className="mt-1">
            {t(`advisor.mode.${provider}`)}
          </Badge>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/settings#ai">
            <SettingsIcon />
            {t("advisor.configure")}
          </Link>
        </Button>
      </div>

      {loading || !snapshot || !labels ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <>
          <CreditScoreCard
            snapshot={snapshot}
            labels={labels}
            lang={lang}
            onAskAi={() => {
              setRequest({ id: Date.now(), text: t("advisor.chip.score") })
              document.getElementById("advisor-chat")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
          />
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("advisor.insights")}</h2>
            <InsightList insights={list} />
          </section>
          {strategy && <StrategyCard strategy={strategy} labels={labels} />}
          <section id="advisor-chat" className="scroll-mt-20 space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("advisor.ask")}</h2>
            <AdvisorChat snapshot={snapshot} labels={labels} lang={lang} request={request} />
          </section>
        </>
      )}
    </div>
  )
}
