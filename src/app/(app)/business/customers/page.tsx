"use client"

import { useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { ClockIcon, UserRoundSearchIcon, UsersRoundIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { busiestHours, hourRange, parseInsights } from "@/lib/customer-insights"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * «អតិថិជនទៀងទាត់» (founder, 4/11/2026 — lib/customer-insights.ts): from the payer names on the KHQR payments of the last 90
 * days — who comes back most, who has not come for longer than usual, the busiest hours. The owner only (the database refuses
 * anyone else); never in a group or the bot. Amounts follow the eye (<Amount>).
 */
export default function CustomerInsightsPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const business = workspace?.type === "BUSINESS"
  const owner = workspace?.role === "OWNER"
  const query = useQuery({
    queryKey: ["khqr-customer-insights", workspace?.id],
    enabled: Boolean(workspace?.id && business && owner),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("khqr_customer_insights", { p_workspace_id: workspace!.id, p_days: 90 })
      if (error) throw error
      return parseInsights(data)
    },
  })

  if (workspace && !business) return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("arap.businessOnly")}</p>
  if (workspace && !owner) return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("regulars.ownerOnly")}</p>

  const data = query.data
  const top = data ? busiestHours(data.hours) : []
  const peak = Math.max(1, ...top.map((h) => h.sales))
  const day = (iso: string) => (iso ? format(parseISO(iso), "dd/MM/yyyy") : "")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("regulars.title")}</h1>
        {data && <p className="text-sm text-muted-foreground">{t("regulars.summary", { days: data.days, sales: data.sales, payers: data.payers })}</p>}
      </div>

      {query.isLoading ? (
        <Skeleton className="h-60 w-full rounded-2xl" />
      ) : query.isError ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("common.error")}</p>
      ) : !data || data.sales === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("regulars.empty")}</p>
      ) : (
        <>
          <Card className="gap-3 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClockIcon className="size-4 text-primary" aria-hidden />
              {t("regulars.hours")}
            </h2>
            <ul className="space-y-2">
              {top.map((h) => (
                <li key={h.hour} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm tabular-nums">
                    <span className="font-medium">{hourRange(h.hour)}</span>
                    <span className="text-muted-foreground">{t("regulars.salesN", { n: h.sales })}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round((h.sales / peak) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-0 py-0">
            <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <UsersRoundIcon className="size-4 text-primary" aria-hidden />
              {t("regulars.regulars")}
            </h2>
            {data.regulars.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">{t("regulars.noRegulars")}</p>
            ) : (
              <ul className="divide-y">
                {data.regulars.map((r) => (
                  <li key={r.payer} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.payer}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{t("regulars.visits", { n: r.visits, date: day(r.last_at) })}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-sm font-semibold tabular-nums">
                      {r.khr > 0 && <Amount value={r.khr} currency="KHR" />}
                      {r.usd > 0 && <Amount value={r.usd} currency="USD" />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.missing.length > 0 && (
            <Card className="gap-0 py-0">
              <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                <UserRoundSearchIcon className="size-4 text-amber-500" aria-hidden />
                {t("regulars.missing")}
              </h2>
              <ul className="divide-y">
                {data.missing.map((m) => (
                  <li key={m.payer} className="px-4 py-3">
                    <span className="block truncate font-medium">{m.payer}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{t("regulars.missingLine", { days: m.days_since, n: m.visits })}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("regulars.note")}</p>
        </>
      )}
    </div>
  )
}
