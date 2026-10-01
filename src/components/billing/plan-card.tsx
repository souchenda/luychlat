"use client"

import { format } from "date-fns"
import { CrownIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { showUpgrade, usePlan } from "@/lib/plan"

/** Settings: current plan, expiry, AI usage, upgrade/renew — and the admin link. */
export function PlanCard() {
  const t = useT()
  const { plan, isPro } = usePlan()
  const daysLeft = plan.period_end ? Math.ceil((new Date(plan.period_end).getTime() - Date.now()) / 86_400_000) : null
  const expired = !isPro && plan.last_period_end

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("plan.title")}</h2>
      <Card
        className={
          isPro
            ? "gap-3 border-0 bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-4 text-white"
            : "gap-3 px-4 py-4"
        }
      >
        <div className="flex items-center gap-3">
          <span className={isPro ? "rounded-full bg-white/15 p-2" : "rounded-full bg-muted p-2"}>
            <CrownIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{isPro ? "LuySmart PRO" : t("plan.free")}</p>
            <p className={isPro ? "text-xs text-white/80" : "text-xs text-muted-foreground"}>
              {isPro && plan.period_end
                ? t("plan.until", { date: format(new Date(plan.period_end), "dd/MM/yyyy"), days: daysLeft ?? 0 })
                : expired
                  ? t("plan.expired", { date: format(new Date(plan.last_period_end!), "dd/MM/yyyy") })
                  : t("plan.freeHint")}
            </p>
          </div>
          <Button size="sm" variant={isPro ? "secondary" : "default"} onClick={() => showUpgrade("general")}>
            {isPro ? t("plan.renew") : t("upgrade.cta")}
          </Button>
        </div>
        {isPro && plan.ai_queries_per_month > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/80">
              <span>{t("plan.aiUsage")}</span>
              <span className="tabular-nums">
                {plan.ai_queries_used}/{plan.ai_queries_per_month}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.min(100, (plan.ai_queries_used / plan.ai_queries_per_month) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </Card>
      {plan.is_admin && (
        <Button asChild variant="outline" className="w-full">
          <Link href="/admin">
            <ShieldCheckIcon />
            {t("admin.title")}
          </Link>
        </Button>
      )}
    </section>
  )
}
