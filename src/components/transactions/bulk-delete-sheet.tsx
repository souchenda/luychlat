"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { stepUp } from "@/components/security/step-up"
import { useTransactionMutations, useTransactions, useWallets } from "@/lib/data/hooks"
import { walletDeltas } from "@/lib/data/ledger"
import { todayDate } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, roundMoney } from "@/lib/money"
import { formatRange, rangeToFilter } from "@/lib/reports/ranges"
import { cn } from "@/lib/utils"

type Mode = "today" | "custom"

/**
 * លុបតាមកាលបរិច្ឆេទ: removes all entries of the active workspace in a date
 * range (default: today). Previews the count and each wallet's balance change
 * before anything is deleted; older history is untouched.
 */
export function BulkDeleteSheet({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
}) {
  const t = useT()
  const today = todayDate()
  const [mode, setMode] = useState<Mode>("today")
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const range = mode === "today" ? { from: today, to: today } : { from, to }
  const valid = range.from <= range.to
  const filter = useMemo(() => rangeToFilter({ from: range.from, to: range.to }), [range.from, range.to])

  const preview = useTransactions(open && valid ? workspaceId : undefined, filter)
  const walletsData = useWallets(workspaceId).data
  const wallets = useMemo(() => walletsData ?? [], [walletsData])
  const { removeRange } = useTransactionMutations(workspaceId)
  const rows = useMemo(() => preview.data ?? [], [preview.data])

  // What each wallet's balance will do when these rows are removed.
  const effects = useMemo(() => {
    const currency = new Map(wallets.map((w) => [w.id, w.currency]))
    const totals = new Map<string, number>()
    for (const tx of rows) {
      for (const { walletId, delta } of walletDeltas(tx, (id) => currency.get(id) ?? "USD")) {
        totals.set(walletId, (totals.get(walletId) ?? 0) - delta)
      }
    }
    return wallets
      .filter((w) => totals.has(w.id))
      .map((w) => ({ wallet: w, change: roundMoney(totals.get(w.id)!, w.currency) }))
      .filter((e) => e.change !== 0)
  }, [rows, wallets])
  const debtLinked = rows.filter((tx) => tx.debt_id).length

  const remove = async () => {
    if (!rows.length || !(await stepUp(t("bulk.confirm", { count: rows.length, range: formatRange(range) })))) return
    try {
      const count = await removeRange.mutateAsync(filter)
      toast.success(t("bulk.done", { count }))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("bulk.title")} description={t("bulk.description")}>
      <div className="space-y-4">
        <Segmented
          aria-label={t("bulk.title")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "today", label: t("bulk.today") },
            { value: "custom", label: t("bulk.custom") },
          ]}
        />
        {mode === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="bulk-from">{t("reports.from")}</Label>
              <Input id="bulk-from" type="date" max="9999-12-31" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bulk-to">{t("reports.to")}</Label>
              <Input id="bulk-to" type="date" max="9999-12-31" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </div>
          </div>
        )}
        {!valid && <p className="text-sm text-destructive">{t("reports.invalidRange")}</p>}

        <div className="space-y-2 rounded-xl border p-3 text-sm">
          <p className="font-medium">
            {preview.isLoading ? <Loader2Icon className="inline size-4 animate-spin" /> : t("bulk.count", { count: rows.length })}
            <span className="block text-xs font-normal text-muted-foreground">{formatRange(range)}</span>
          </p>
          {effects.length > 0 && (
            <ul className="space-y-1 text-xs">
              {effects.map(({ wallet, change }) => (
                <li key={wallet.id} className="flex justify-between">
                  <span className="text-muted-foreground">{wallet.name}</span>
                  <span className={cn("tabular-nums font-medium", change > 0 ? "text-emerald-600" : "text-red-600")}>
                    {formatMoney(change, wallet.currency, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {debtLinked > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("bulk.debtLinked", { count: debtLinked })}</p>}
          <p className="text-xs text-muted-foreground">{t("bulk.historySafe")}</p>
        </div>

        <Button variant="destructive" className="h-12 w-full text-base" onClick={remove} disabled={!rows.length || removeRange.isPending}>
          {removeRange.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
          {t("bulk.submit", { count: rows.length })}
        </Button>
      </div>
    </BottomSheet>
  )
}
