"use client"

import { FlaskConicalIcon, Loader2Icon, UndoIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { useT } from "@/lib/i18n/use-t"
import { useAdminTestPlan, usePlan, type Tier } from "@/lib/plan"

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** True while an admin's test plan is active (also hides itself once the time is up). */
function useActiveTest() {
  const { plan } = usePlan()
  const test = plan.test_plan ?? null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!test) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [test])
  return test && Date.parse(test.expires_at) > now ? test : null
}

/**
 * Sticky banner at the top of every screen while an admin tests their account
 * as another plan: "🧪 Testing as FREE · until 18:30 · Return".
 */
export function TestPlanBanner() {
  const t = useT()
  const test = useActiveTest()
  const end = useAdminTestPlan()
  if (!test) return null
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 pt-[max(env(safe-area-inset-top),0.375rem)] text-xs font-semibold text-amber-950 print:hidden">
      <FlaskConicalIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{t("testPlan.banner", { tier: test.tier, time: kmDigits(hhmm(test.expires_at)) })}</span>
      <button
        type="button"
        onClick={() => end.mutate({ tier: null }, { onSuccess: () => toast.success(t("testPlan.ended")), onError: () => toast.error(t("common.error")) })}
        disabled={end.isPending}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950/15 px-2 py-0.5 hover:bg-amber-950/25"
      >
        {end.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <UndoIcon className="size-3" aria-hidden />}
        {t("testPlan.return")}
      </button>
    </div>
  )
}

const REAL = "REAL"

/** Profile (admins only): "Test my account as [Real | FREE | PRO | ULTRA]" for 2 hours. */
export function TestPlanSwitch() {
  const t = useT()
  const { plan } = usePlan()
  const test = useActiveTest()
  const set = useAdminTestPlan()
  if (!plan.is_admin) return null
  const value = test?.tier ?? REAL

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <FlaskConicalIcon className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="flex-1 text-sm font-medium">{t("testPlan.title")}</p>
        {set.isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <Segmented<string>
        aria-label={t("testPlan.title")}
        value={value}
        disabled={set.isPending}
        onChange={(v) => {
          if (v === value) return
          set.mutate(
            { tier: v === REAL ? null : (v as Tier), hours: 2 },
            {
              onSuccess: () => toast.success(v === REAL ? t("testPlan.ended") : t("testPlan.started", { tier: v })),
              onError: () => toast.error(t("testPlan.failed")),
            },
          )
        }}
        options={[
          { value: REAL, label: t("testPlan.real") },
          { value: "FREE", label: "FREE" },
          { value: "PRO", label: "PRO" },
          { value: "ULTRA", label: "ULTRA" },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("testPlan.hint")}</p>
    </div>
  )
}
