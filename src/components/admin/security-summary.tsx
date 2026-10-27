"use client"

import { useQuery } from "@tanstack/react-query"

import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const client = () => getSupabaseBrowserClient()!
const ppTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)

type SecuritySummary = {
  traffic: { total: number; blocked: number; limited: number; errors: number; peak_blocked_per_min: number; attack_minutes: number; first_blocked: string | null; last_blocked: string | null }
  health: { max_cpu: number | null; max_ram: number | null; ok_pct: number | null }
  incidents: { issue: string; started_at: string; ended_at: string | null; minutes: number; peak: number | null; note: string | null }[]
  now: { at: string; ok: boolean; cpu: number | null; ram: number | null; issues: string[] } | null
}
const fmt = (n: number) => Number(n).toLocaleString("en-US")

/** Blocked / rate-limited traffic (Nginx), CPU / RAM peaks, incidents with recovery time, and health now. */
export function SecuritySummaryCard({ from, to, today }: { from: string; to: string; today: string }) {
  const t = useT()
  const live = to === today
  const query = useQuery({
    queryKey: ["dev-security", from, to],
    refetchInterval: live ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await client().rpc("dev_security_summary", { p_from: from, p_to: to })
      if (error) throw error
      return data as SecuritySummary
    },
  })
  const s = query.data
  if (query.isLoading) return null
  if (!s) return query.isError ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-destructive">{t("common.error")}</p> : null
  const tr = s.traffic
  const span = tr.first_blocked && tr.last_blocked ? `${ppTime(tr.first_blocked)}–${ppTime(tr.last_blocked)}` : ""

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">{t("dev.security")}</h2>
        {s.now && (
          <span className={cn("text-xs font-medium", s.now.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600")}>
            {s.now.ok ? t("dev.healthyNow", { cpu: s.now.cpu ?? "–", ram: s.now.ram ?? "–" }) : t("dev.issuesNow", { issues: s.now.issues.join(", ") })}
          </span>
        )}
      </div>
      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={cn("rounded-xl px-2 py-2", tr.blocked > 0 ? "bg-rose-50 dark:bg-rose-500/10" : "bg-muted/50")}>
            <p className="text-[11px] text-muted-foreground">{t("dev.blocked")}</p>
            <p className={cn("text-lg font-bold tabular-nums", tr.blocked > 0 && "text-rose-600")}>{fmt(tr.blocked)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{t("dev.maxCpu")}</p>
            <p className={cn("text-lg font-bold tabular-nums", (s.health.max_cpu ?? 0) >= 90 && "text-amber-600")}>{s.health.max_cpu ?? "–"}%</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{t("dev.healthyPct")}</p>
            <p className="text-lg font-bold tabular-nums">{s.health.ok_pct ?? "–"}%</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("dev.trafficLine", { total: fmt(tr.total), limited: fmt(tr.limited), errors: fmt(tr.errors), ram: s.health.max_ram ?? "–" })}
          {tr.blocked > 0 && ` · ${t("dev.attackLine", { peak: fmt(tr.peak_blocked_per_min), minutes: tr.attack_minutes, window: span })}`}
        </p>
        {s.incidents.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            {s.incidents.map((i) => (
              <div key={i.started_at + i.issue} className="text-sm">
                <p className="font-medium">
                  {i.ended_at ? "✅" : "🔴"} {i.issue.toUpperCase()}
                  {i.peak != null && ` · ${t("dev.peak", { value: i.peak })}`}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {ppTime(i.started_at)} → {i.ended_at ? ppTime(i.ended_at) : t("dev.ongoing")} · {t("dev.recoveredIn", { minutes: i.minutes })}
                  {i.note ? ` · ${i.note}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

