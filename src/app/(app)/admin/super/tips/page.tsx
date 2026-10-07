"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import Link from "next/link"

import { DayCard, type DailyTip } from "@/components/admin/daily-tip-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const DAYS = 7
const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}
const ppToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * Super Admin › Daily tips: the 12:00 tip for @LuyChlatCommunity, today and the
 * next days. Edit the text, use a custom poster, approve or skip. Nothing is
 * posted without approval (the database enforces it); the bot also sends a
 * preview to Telegram at 10:30 with the same buttons.
 */
export default function DailyTipsPage() {
  const t = useT()
  const { plan, loading } = usePlan()
  const today = ppToday()
  const query = useQuery({
    queryKey: ["daily-tips", today],
    enabled: plan.staff_role === "super_admin",
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await client().rpc("super_tips_list", { p_from: today, p_days: DAYS })
      if (error) throw error
      return (data as DailyTip[]) ?? []
    },
  })

  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (plan.staff_role !== "super_admin") {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }

  const byDay = new Map((query.data ?? []).map((d) => [d.day, d]))
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/admin/super">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{t("tips.adminTitle")}</h1>
      </div>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("tips.adminHint")}</p>
      {query.isLoading ? (
        <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
      ) : query.isError ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-destructive">{t("common.error")}</p>
      ) : (
        Array.from({ length: DAYS }, (_, i) => addDays(today, i)).map((day) => <DayCard key={day} day={day} tip={byDay.get(day) ?? null} />)
      )}
    </div>
  )
}

