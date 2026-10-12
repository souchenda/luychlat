"use client"

import { useQuery } from "@tanstack/react-query"
import { MegaphoneIcon } from "lucide-react"

import { rpc, Section } from "@/components/admin/ui"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { ACQUISITION_SOURCES, type AcquisitionSource } from "@/lib/acquisition"

type Counts = Record<AcquisitionSource | "unknown", number>
type Breakdown = Counts & { total: number; last_30_days: Counts }

const EMOJI: Record<AcquisitionSource, string> = { facebook: "🔵", telegram: "✈️", referral: "👥", organic_search: "🔍" }

/** Admin overview: where users heard of the app (the first-visit question), all time and the last 30 days. */
export function AcquisitionSources() {
  const t = useT()
  const { data } = useQuery({ queryKey: ["admin", "acquisition-sources"], queryFn: () => rpc<Breakdown>("admin_acquisition_sources"), staleTime: 60_000 })
  if (!data) return null
  const answered = ACQUISITION_SOURCES.reduce((n, s) => n + Number(data[s] ?? 0), 0)
  const rows = [...ACQUISITION_SOURCES].sort((a, b) => Number(data[b]) - Number(data[a]))
  return (
    <Section title={t("admin.sources")} icon={<MegaphoneIcon />}>
      <Card className="gap-2.5 px-4 py-3">
        {rows.map((s) => {
          const n = Number(data[s] ?? 0)
          const pct = answered ? Math.round((n / answered) * 100) : 0
          return (
            <div key={s} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>{EMOJI[s]}</span>
                <span className="min-w-0 flex-1 truncate">{t(`source.${s}` as MessageKey)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">+{Number(data.last_30_days?.[s] ?? 0)} · {t("admin.sources30")}</span>
                <span className="w-16 text-right font-semibold tabular-nums">
                  {n} <span className="text-xs font-normal text-muted-foreground">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
        <p className="border-t pt-2 text-xs text-muted-foreground tabular-nums">
          {t("admin.sourcesUnknown")}: {Number(data.unknown ?? 0)} / {Number(data.total ?? 0)}
        </p>
      </Card>
    </Section>
  )
}
