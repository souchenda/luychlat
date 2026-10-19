"use client"

import { Loader2Icon, TargetIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useWalletMutations, useWallets, useWorkspaces } from "@/lib/data/hooks"
import { findHajjGoal, HAJJ_DEFAULT_MONTHS, HAJJ_PACKAGES, HAJJ_YEARS, hajjGoalInput, hajjPlan, hajjProgress, progressBlocks, type HajjPackage } from "@/lib/islamic/hajj-plan"
import { useMarket } from "@/lib/market"
import { formatMoney, parseAmount } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

const usd = (n: number, digits = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
const num = (n: number) => n.toLocaleString("en-US")

const chip = (active: boolean) =>
  cn("min-h-10 rounded-full border px-3 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card text-muted-foreground")

/**
 * «🕋 ផែនការសន្សំសម្រាប់ធ្វើរូកូន» (founder, 19/10/2026): Hajj or Umrah, a target and a time → the monthly and daily
 * savings, the target in SAR and riel; with the member's goal tagged goal_hajj (Personal space) its real progress, or one
 * tap to create it. On /islamic only (lib/islamic/hajj-plan.ts).
 */
export function HajjPlanCard() {
  const usdKhr = useMarket().data?.nbc?.usd_khr ?? 0
  const me = useSessionStore((s) => s.user?.id)
  const personal = (useWorkspaces().data ?? []).find((w) => w.user_id === me && w.type === "PERSONAL")
  const wallets = useWallets(personal?.id).data ?? []
  const goal = findHajjGoal(wallets)
  const create = useWalletMutations(personal?.id).create

  const [pkg, setPkg] = useState<HajjPackage>("hajj")
  const [target, setTarget] = useState("5000")
  const [months, setMonths] = useState(HAJJ_DEFAULT_MONTHS)
  const [custom, setCustom] = useState(false)
  // A preset sets its amount; «custom» keeps what is typed.
  useEffect(() => {
    const preset = HAJJ_PACKAGES.find((p) => p.key === pkg)
    if (preset) setTarget(String(preset.usd))
  }, [pkg])

  const progress = goal ? hajjProgress(goal) : null
  // A goal in riel: its figures in dollars at the NBC rate (the plan is in dollars).
  const toUsd = (n: number) => (goal?.currency === "KHR" ? (usdKhr > 0 ? n / usdKhr : 0) : n)
  const targetUsd = goal ? toUsd(progress!.target) : parseAmount(target)
  const plan = hajjPlan({ targetUsd, months, savedUsd: goal ? toUsd(progress!.saved) : 0, usdKhr })

  const createGoal = () =>
    create.mutate(hajjGoalInput(parseAmount(target), months), {
      onSuccess: () => toast.success("🎯 បានបង្កើតគោលដៅ «សន្សំទៅធ្វើរូកូន» — អ៊ីនស្យាអល់ឡោះ!"),
      onError: () => toast.error("បង្កើតគោលដៅមិនបានទេ។ សូមសាកម្ដងទៀត។"),
    })

  return (
    <Card className="gap-3 px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold">🕋 ផែនការសន្សំសម្រាប់ធ្វើរូកូន</h2>
        <p className="text-xs text-muted-foreground">រៀបចំផែនការហិរញ្ញវត្ថុដើម្បីសម្រេចបំណងប្រាថ្នាបំពេញកាតព្វកិច្ចសាសនា</p>
      </div>

      {!goal && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="កញ្ចប់">
            {HAJJ_PACKAGES.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={pkg === p.key} className={chip(pkg === p.key)} onClick={() => setPkg(p.key)}>
                {p.label} - {usd(p.usd)}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={pkg === "custom"} className={chip(pkg === "custom")} onClick={() => setPkg("custom")}>
              ✏️ កំណត់ផ្ទាល់ខ្លួន
            </button>
          </div>
          <div className="space-y-1">
            <Input inputMode="decimal" value={target} onChange={(e) => {
                setPkg("custom")
                setTarget(e.target.value)
              }} className="h-12 text-lg font-semibold tabular-nums" aria-label="គោលដៅ ($ USD)" />
            {plan && (
              <p className="text-xs text-muted-foreground tabular-nums">
                ≈ {num(plan.targetSar)} SAR{plan.targetKhr ? ` · ≈ ${num(plan.targetKhr)} ៛` : ""}
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="រយៈពេល">
        {HAJJ_YEARS.map((y) => (
          <button key={y} type="button" role="radio" aria-checked={!custom && months === y * 12} className={chip(!custom && months === y * 12)} onClick={() => {
              setCustom(false)
              setMonths(y * 12)
            }}>
            {y} ឆ្នាំ
          </button>
        ))}
        <button type="button" role="radio" aria-checked={custom} className={chip(custom)} onClick={() => setCustom(true)}>
          ខែ…
        </button>
      </div>
      {custom && (
        <label className="flex items-center gap-3 text-sm">
          <input type="range" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="flex-1 accent-emerald-600" aria-label="ចំនួនខែ" />
          <span className="w-16 text-right tabular-nums">{months} ខែ</span>
        </label>
      )}

      {plan && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-emerald-500/10 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">ត្រូវសន្សំ / ខែ</p>
            <p className="text-base font-bold tabular-nums">{usd(plan.monthlyUsd, 2)}</p>
            {plan.monthlyKhr > 0 && <p className="text-[11px] text-muted-foreground tabular-nums">~{num(plan.monthlyKhr)} ៛</p>}
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">ប្រហែល / ថ្ងៃ</p>
            <p className="text-base font-semibold tabular-nums">{usd(plan.dailyUsd, 2)}</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">គោលដៅជា SAR</p>
            <p className="text-base font-semibold tabular-nums">~{num(plan.targetSar)}</p>
          </div>
        </div>
      )}

      {goal && progress ? (
        <Link href={`/wallets/${goal.id}`} className="block rounded-xl border px-3 py-2.5">
          <p className="text-xs text-muted-foreground">🎯 {goal.name}</p>
          <p className="font-mono text-sm tabular-nums">
            {progressBlocks(progress.percent)} {formatMoney(progress.saved, goal.currency)} / {formatMoney(progress.target, goal.currency)} ({progress.percent}%)
          </p>
        </Link>
      ) : (
        <Button className="h-11 w-full" disabled={!personal || !plan || create.isPending} onClick={createGoal}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : <TargetIcon />}
          បង្កើតគោលដៅសន្សំក្នុងកាបូបលុយ
        </Button>
      )}

      <p className="text-center text-sm text-emerald-800 dark:text-emerald-200">« អល់ឡោះ ﷻ ទ្រង់នឹងជួយសម្រួលដល់អ្នកដែលមានបំណងប្រាថ្នាស្មោះត្រង់ក្នុងការបំពេញរូកូនទី ៥ របស់ទ្រង់។ »</p>
      <p className="text-[11px] text-muted-foreground">ការប៉ាន់ស្មាន៖ តម្លៃកញ្ចប់ពិតប្រាកដ សូមសួរភ្នាក់ងារធ្វើដំណើរ។ SAR តាមអត្រា NBC ÷ 3.75។</p>
    </Card>
  )
}
