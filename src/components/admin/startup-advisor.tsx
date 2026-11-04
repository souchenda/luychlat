"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CompassIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { rpc, Section, Stat } from "@/components/admin/ui"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { STAGE_LABEL, startupReport, type Cost, type CostKind } from "@/lib/startup-economics"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Metrics = { paying_users: number; mrr_usd: number; conversion_pct: number | null; churn_30d_pct: number | null; mau: number }
type Settings = { costs: Cost[]; founder_pay_usd: number; profit_target: number }

const MILESTONE: Record<string, string> = { BREAK_EVEN: "លែងខាត", SELF_SUSTAINING: "រួចខ្លួន", PROFIT: "ចំណេញជាលំដាប់" }

/**
 * «ទីប្រឹក្សាអាជីវកម្ម» — App Luy Chlat as a business, for bang alone (founder, 4/11/2026 — docs/startup-advisor.md): the
 * stage now and how far break-even, self-sustaining and steady profit are, from the real subscription numbers and the costs
 * he lists (lib/startup-economics.ts — stated rules, estimates said so, no date without growth).
 */
export function StartupAdvisor() {
  const queryClient = useQueryClient()
  const db = getSupabaseBrowserClient()
  const { data: m } = useQuery({ queryKey: ["admin", "exec-metrics"], queryFn: () => rpc<Metrics>("admin_exec_metrics") })
  const { data: history } = useQuery({ queryKey: ["admin", "paying-history"], queryFn: () => rpc<{ month: string; paying: number }[]>("startup_paying_history", { p_months: 6 }) })
  const settings = useQuery({
    queryKey: ["admin", "startup-settings"],
    enabled: Boolean(db),
    queryFn: async () => ((await db!.from("startup_settings").select("costs, founder_pay_usd, profit_target").eq("id", 1).maybeSingle()).data as Settings | null),
  })
  const [draft, setDraft] = useState<{ costs: { name: string; usd: string; kind: CostKind }[]; pay: string; target: string } | null>(null)

  useEffect(() => {
    if (draft || !settings.data) return
    const s = settings.data
    setDraft({ costs: s.costs.map((c) => ({ name: c.name, usd: String(c.usd || ""), kind: c.kind })), pay: String(Number(s.founder_pay_usd) || ""), target: String(Math.round(Number(s.profit_target) * 100)) })
  }, [settings.data, draft])

  const report = useMemo(() => {
    if (!m || !draft) return null
    return startupReport({
      mrrUsd: Number(m.mrr_usd) || 0,
      payingUsers: Number(m.paying_users) || 0,
      payingHistory: (history ?? []).map((h) => Number(h.paying)),
      costs: draft.costs.map((c) => ({ name: c.name, usd: Number(c.usd) || 0, kind: c.kind })),
      founderPayUsd: Number(draft.pay) || 0,
      profitTarget: (Number(draft.target) || 0) / 100,
    })
  }, [m, history, draft])

  const save = async () => {
    if (!draft || !db) return
    const row = {
      id: 1,
      costs: draft.costs.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim().slice(0, 60), usd: Math.max(0, Number(c.usd) || 0), kind: c.kind })),
      founder_pay_usd: Math.max(0, Number(draft.pay) || 0),
      profit_target: Math.min(0.9, Math.max(0, (Number(draft.target) || 0) / 100)),
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from("startup_settings").upsert(row)
    if (error) return toast.error("រក្សាទុកមិនបានទេ")
    toast.success("បានរក្សាទុក")
    void queryClient.invalidateQueries({ queryKey: ["admin", "startup-settings"] })
  }

  const filled = draft?.costs.some((c) => Number(c.usd) > 0)

  return (
    <Section title="ទីប្រឹក្សាអាជីវកម្ម — អេប លុយឆ្លាត" icon={<CompassIcon />}>
      {report && m ? (
        <Card className="gap-3 px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", report.stage === "LOSS" ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : report.stage === "NEAR" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
              {STAGE_LABEL[report.stage]}
            </span>
            <span className={cn("text-sm font-semibold tabular-nums", report.profitUsd < 0 ? "text-rose-600" : "text-emerald-600")}>
              {report.profitUsd < 0 ? "ខាត" : "ចំណេញ"} {formatMoney(Math.abs(report.profitUsd), "USD")}/ខែ
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="អ្នកបង់" value={Number(m.paying_users)} />
            <Stat label="ARPU" value={report.arpu === null ? "—" : formatMoney(report.arpu, "USD")} />
            <Stat label="កំណើន/ខែ" value={report.netNewPerMonth === null ? "—" : `${report.netNewPerMonth > 0 ? "+" : ""}${report.netNewPerMonth}`} />
          </div>
          <ul className="space-y-2">
            {report.milestones.map((ms) => (
              <li key={ms.stage} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <span className="font-medium">{MILESTONE[ms.stage]}</span>
                <span className="text-right tabular-nums">
                  {ms.payingNeeded === null ? "មិនទាន់គណនាបាន" : `ត្រូវការ ${ms.payingNeeded} អ្នកបង់`}
                  <span className="block text-xs text-muted-foreground">
                    {ms.monthsAway === 0 ? "សម្រេចហើយ" : ms.monthsAway === null ? "មិនទាន់ប៉ាន់ស្មានបាន (គ្មានកំណើន)" : `ប៉ាន់ស្មាន ~${ms.monthsAway} ខែទៀត`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            ការប៉ាន់ស្មាន៖ ARPU = MRR ÷ អ្នកបង់ · ចំណេញពីម្នាក់ = ARPU − ថ្លៃក្នុងម្នាក់ · ខែ = អ្នកបង់ដែលនៅខ្វះ ÷ កំណើនមធ្យម 3 ខែចុងក្រោយ។
            {!filled && " បំពេញចំណាយខាងក្រោមជាមុន ទើបលេខត្រឹមត្រូវ។"}
          </p>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">កំពុងផ្ទុក…</p>
      )}

      {draft && (
        <Card className="gap-3 px-4 py-4">
          <p className="font-semibold">ចំណាយប្រចាំខែរបស់អេប (USD)</p>
          {draft.costs.map((c, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border px-3 py-2">
              <div className="flex gap-2">
                <input value={c.name} onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
                <input value={c.usd} inputMode="decimal" placeholder="0" onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, usd: e.target.value } : x)) })} className="h-10 w-20 rounded-lg border bg-background px-2 text-right text-sm tabular-nums" />
                <button type="button" aria-label="លុប" onClick={() => setDraft({ ...draft, costs: draft.costs.filter((_, j) => j !== i) })} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                  <Trash2Icon className="size-4" />
                </button>
              </div>
              <Segmented value={c.kind} onChange={(kind) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, kind } : x)) })} options={[{ value: "FIXED", label: "ថេរ/ខែ" }, { value: "PER_PAYING", label: "ក្នុងអ្នកបង់ម្នាក់" }]} aria-label="ប្រភេទចំណាយ" />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, costs: [...draft.costs, { name: "", usd: "", kind: "FIXED" }] })}>
            <PlusIcon /> បន្ថែមចំណាយ
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-sm">ប្រាក់ខែបង (រួចខ្លួន)</span>
              <input value={draft.pay} inputMode="decimal" placeholder="0" onChange={(e) => setDraft({ ...draft, pay: e.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-right tabular-nums" />
            </label>
            <label className="space-y-1">
              <span className="text-sm">គោលដៅចំណេញ (%)</span>
              <input value={draft.target} inputMode="numeric" onChange={(e) => setDraft({ ...draft, target: e.target.value })} className="h-10 w-full rounded-lg border bg-background px-2 text-right tabular-nums" />
            </label>
          </div>
          <Button type="button" onClick={() => void save()}>
            រក្សាទុក
          </Button>
        </Card>
      )}
    </Section>
  )
}
