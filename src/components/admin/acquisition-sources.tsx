"use client"

import { useQuery } from "@tanstack/react-query"
import { GlobeIcon, MegaphoneIcon, SearchIcon, SendIcon, ThumbsUpIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { rpc, Section } from "@/components/admin/ui"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { ACQUISITION_SOURCES, type AcquisitionSource } from "@/lib/acquisition"

type Row = AcquisitionSource | "other"
type Counts = Record<Row | "unknown", number>
type Breakdown = Counts & { total: number; last_30_days: Counts; other_sources?: { label: string; count: number }[] }

const ICON: Record<Row, LucideIcon> = { facebook: ThumbsUpIcon, telegram: SendIcon, referral: UsersIcon, organic_search: SearchIcon, other: GlobeIcon }
const ROWS: Row[] = [...ACQUISITION_SOURCES, "other"]

/** Admin overview: where users heard of the app (the first-visit question), all time and the last 30 days. */
export function AcquisitionSources() {
  const t = useT()
  const { data } = useQuery({ queryKey: ["admin", "acquisition-sources"], queryFn: () => rpc<Breakdown>("admin_acquisition_sources"), staleTime: 60_000 })
  if (!data) return null
  const answered = ROWS.reduce((n, s) => n + Number(data[s] ?? 0), 0)
  const rows = [...ROWS].sort((a, b) => Number(data[b] ?? 0) - Number(data[a] ?? 0))
  const typed = data.other_sources ?? []
  return (
    <Section title={t("admin.sources")} icon={<MegaphoneIcon />}>
      <Card className="gap-2.5 px-4 py-3">
        {rows.map((s) => {
          const n = Number(data[s] ?? 0)
          const Icon = ICON[s]
          const pct = answered ? Math.round((n / answered) * 100) : 0
          return (
            <div key={s} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
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
        {/* The typed «ផ្សេងៗ» answers, grouped — new channels (TikTok, a poster, an event…) show here first. */}
        {typed.length > 0 && (
          <div className="space-y-1.5 border-t pt-2">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <GlobeIcon className="size-3.5" aria-hidden />
              {t("admin.sourcesOther")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {typed.map((o) => (
                <span key={o.label} className="rounded-lg bg-muted px-2 py-1 text-xs">
                  {o.label} <span className="font-semibold tabular-nums">· {o.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground tabular-nums">
          {t("admin.sourcesUnknown")}: {Number(data.unknown ?? 0)} / {Number(data.total ?? 0)}
        </p>
      </Card>
    </Section>
  )
}
