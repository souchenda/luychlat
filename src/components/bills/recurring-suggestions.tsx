"use client"

import { BellPlusIcon, LightbulbIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useBillMutations, type Bill } from "@/lib/bills"
import { useCategories, useTransactions } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { detectRecurring } from "@/lib/recurring-detect"
import { usePrefsStore } from "@/stores/prefs-store"

const DISMISSED_KEY = "luychlat-recurring-dismissed"
const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

/** The last 150 days, fetched once per workspace (lib/recurring-detect.ts looks back that far). */
const since = () => new Date(Date.now() - 150 * 86_400_000).toISOString().slice(0, 10)

/**
 * «💡 រកឃើញការបង់ប្រចាំខែ» on /bills (founder, 4/11/2026 — Personal only): a payment made every month, noticed from the
 * person's own entries, with one tap to turn it into a reminder — or ✕ for «not a bill» (remembered on this phone). Shown
 * only when something is found; never creates a bill without the tap.
 */
export function RecurringSuggestions({ workspaceId, bills }: { workspaceId: string; bills: Bill[] }) {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const filter = useMemo(() => ({ from: since() }), [])
  const txs = useTransactions(workspaceId, filter).data
  const categories = useCategories(workspaceId).data
  const { save } = useBillMutations(workspaceId)
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()))
  const [busy, setBusy] = useState<string | null>(null)

  const found = useMemo(() => {
    if (!txs) return []
    const name = (id: string | null) => categories?.find((c) => c.id === id)?.name ?? ""
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
    return detectRecurring({ transactions: txs, bills, today, categoryName: name }).filter((f) => !dismissed.includes(f.key))
  }, [txs, bills, categories, dismissed])

  if (!found.length) return null

  const dismiss = (key: string) => {
    const next = [...dismissed, key]
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-50)))
    } catch {
      // Private mode: hidden for this visit only.
    }
  }

  const remind = async (f: (typeof found)[number]) => {
    setBusy(f.key)
    try {
      await save.mutateAsync({
        input: { title: f.title, kind: "OTHER", amount: f.amount, currency: f.currency, frequency: "MONTHLY", due_day: f.dueDay, due_date: null, nssf_type: null, remind_days: [2], category_id: f.categoryId, is_active: true },
      })
      toast.success(t("recurring.added", { title: f.title }))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="gap-3 border-amber-300/60 bg-amber-50/60 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-500/5">
      <div className="flex items-start gap-2">
        <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("recurring.title")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("recurring.hint")}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {found.map((f) => (
          <li key={f.key} className="flex items-center gap-2 rounded-xl bg-background/80 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{f.title}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{t("recurring.line", { amount: formatMoney(f.amount, f.currency, { hidden }), day: f.dueDay, months: f.months })}</span>
            </span>
            <Button type="button" size="sm" className="h-10 shrink-0" disabled={busy === f.key} onClick={() => void remind(f)}>
              <BellPlusIcon />
              {t("recurring.remind")}
            </Button>
            <button type="button" aria-label={t("recurring.notBill")} onClick={() => dismiss(f.key)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <XIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
