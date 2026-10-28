"use client"

import { useQuery } from "@tanstack/react-query"
import { GaugeIcon, Loader2Icon } from "lucide-react"

import { Section } from "@/components/admin/ui"
import { Card } from "@/components/ui/card"
import { type CapacityItem, capacityItems, SUPABASE_PLAN } from "@/lib/capacity"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import type { OpsReport } from "@/lib/ops-status"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const BAR: Record<CapacityItem["level"], string> = { ok: "bg-emerald-500", warn: "bg-amber-500", act: "bg-red-500" }

/**
 * Control Center › System & bot: how full each thing is and when to act or spend (founder, 28/10/2026 — «don't spend
 * before it's needed; remind me»). The founder's items also reach his Telegram when they turn red (lib/capacity.ts).
 */
export function CapacityCard() {
  const t = useT()
  const report = useQuery({
    queryKey: ["admin", "ops-status"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("ops_status").select("value").eq("key", "summary").maybeSingle()
      if (error) throw error
      return (data?.value as OpsReport | undefined) ?? null
    },
  })
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  const items = capacityItems(report.data?.capacity, today)
  return (
    <Section title={t("ops.cap.title")} icon={<GaugeIcon />}>
      <Card className="gap-0 divide-y py-0">
        {report.isLoading ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : (
          items.map((i) => (
            <div key={i.key} className="space-y-1.5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{t(`ops.cap.${i.key}` as MessageKey)}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {i.used} / {i.limit}
                  {i.pct !== null ? ` · ${i.pct}%` : ""}
                </p>
              </div>
              {i.pct !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", BAR[i.level])} style={{ width: `${Math.min(100, Math.max(2, i.pct))}%` }} />
                </div>
              )}
              <p className={cn("text-[11px]", i.level === "act" ? "font-medium text-red-600" : i.level === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                {t(`ops.cap.${i.key}.when` as MessageKey)}
              </p>
            </div>
          ))
        )}
      </Card>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t(SUPABASE_PLAN === "free" ? "ops.cap.planFree" : "ops.cap.planPro")}</p>
    </Section>
  )
}
