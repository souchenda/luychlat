"use client"

import { useQuery } from "@tanstack/react-query"
import { GaugeIcon } from "lucide-react"

import { rpc, Section } from "@/components/admin/ui"
import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { formatVital, ratingOf, THRESHOLDS, type VitalName } from "@/lib/web-vitals"

type Row = { route: string; device: string; metric: VitalName; p75: number; n: number }
const SHOWN: VitalName[] = ["LCP", "INP", "CLS"]
const TONE = { good: "text-emerald-700 dark:text-emerald-400", "needs-improvement": "text-amber-700 dark:text-amber-400", poor: "text-red-600 dark:text-red-400" } as const

/**
 * ⚡ The app's real speed (founder, 14/11/2026): what 3 in 4 members get on each screen over the last 7 days — the
 * slowest first (by how far its LCP is past Google's «good»). Only screens with 5 reports or more.
 */
export function WebVitalsCard() {
  const t = useT()
  const { data } = useQuery({ queryKey: ["admin", "web-vitals"], queryFn: () => rpc<Row[]>("admin_web_vitals", { p_days: 7 }) })
  const screens = new Map<string, Row[]>()
  for (const r of data ?? []) screens.set(`${r.route}|${r.device}`, [...(screens.get(`${r.route}|${r.device}`) ?? []), r])
  const worst = (rows: Row[]) => Math.max(0, ...rows.map((r) => r.p75 / THRESHOLDS[r.metric][0]))
  const list = [...screens.values()].sort((a, b) => worst(b) - worst(a)).slice(0, 12)
  return (
    <Section title={t("vitals.title")} icon={<GaugeIcon />}>
      <Card className="gap-0 divide-y py-0">
        <p className="px-4 py-2 text-xs text-muted-foreground">{t("vitals.hint")}</p>
        {list.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">{t("vitals.empty")}</p>}
        {list.map((rows) => (
          <div key={`${rows[0].route}|${rows[0].device}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm">{rows[0].route}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t(`vitals.device.${rows[0].device}` as MessageKey)} · {Math.max(...rows.map((r) => r.n))}
              </span>
            </span>
            <span className="flex shrink-0 gap-3 text-xs tabular-nums">
              {SHOWN.map((m) => {
                const r = rows.find((x) => x.metric === m)
                return (
                  <span key={m} className={cn("text-right", r ? TONE[ratingOf(m, r.p75)] : "text-muted-foreground")}>
                    <span className="block text-[10px] text-muted-foreground">{m}</span>
                    {r ? formatVital(m, r.p75) : "—"}
                  </span>
                )
              })}
            </span>
          </div>
        ))}
      </Card>
    </Section>
  )
}
