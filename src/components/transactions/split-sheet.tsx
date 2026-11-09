"use client"

import { Loader2Icon, PlusIcon, Share2Icon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDebtMutations } from "@/lib/data/hooks"
import type { Transaction } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { customShares, evenShares, splitMessage, type SplitShare } from "@/lib/split-bill"
import { useLocaleStore } from "@/stores/locale-store"

type Mode = "even" | "custom"
type Row = { name: string; amount: string }

/**
 * «ចែកថ្លៃ» (founder, 9/11/2026 — lib/split-bill.ts): from an expense, the others who share it, evenly or each their own
 * amount. Each person's part becomes money owed to me (a RECEIVABLE debt, so the debt reminders and repayments work for
 * it); the expense itself stays as it is. Then one tap sends the parts to the group (the phone's share sheet).
 */
export function SplitSheet({ open, onOpenChange, workspaceId, transaction }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string | undefined; transaction: Transaction | null }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const debts = useDebtMutations(workspaceId)
  const [mode, setMode] = useState<Mode>("even")
  const [rows, setRows] = useState<Row[]>([{ name: "", amount: "" }])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<SplitShare[] | null>(null)

  useEffect(() => {
    if (!open) return
    setMode("even")
    setRows([{ name: "", amount: "" }])
    setDone(null)
  }, [open])

  const total = transaction?.amount ?? 0
  const currency = transaction?.currency ?? "USD"
  const title = transaction?.note?.trim() || t("split.defaultTitle")
  const plan = useMemo(() => {
    const names = rows.map((r) => r.name.trim())
    if (mode === "even") {
      const r = evenShares(total, currency, names)
      return { mine: r.mine, shares: r.shares, ok: r.shares.length > 0 && names.every(Boolean) }
    }
    const shares = rows.map((r) => ({ name: r.name.trim(), amount: roundMoney(parseAmount(r.amount) || 0, currency) }))
    const c = customShares(total, currency, shares)
    return { mine: c.mine, shares, ok: c.ok }
  }, [mode, rows, total, currency])

  const save = async () => {
    if (!transaction || !plan.ok) return
    setBusy(true)
    try {
      for (const s of plan.shares) {
        await debts.create.mutateAsync({
          input: {
            type: "RECEIVABLE",
            party_name: s.name,
            contact_phone: null,
            total_amount: s.amount,
            currency,
            interest_rate: 0,
            interest_period: "MONTH",
            start_date: transaction.transaction_date.slice(0, 10),
            due_date: null,
            note: `${t("split.note")}: ${title}`,
          },
        })
      }
      setDone(plan.shares)
      toast.success(t("split.saved", { n: plan.shares.length }))
    } catch {
      toast.error(t("split.failed"))
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!done) return
    const text = splitMessage(title, currency, done, locale)
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast.success(t("split.copied"))
      }
    } catch {
      // The share sheet closed: nothing to do.
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("split.title")} description={`${title} · ${formatMoney(total, currency)}`}>
      {done ? (
        <div className="space-y-3">
          <ul className="space-y-1 text-sm">
            {done.map((s, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{s.name}</span>
                <span className="tabular-nums">{formatMoney(s.amount, currency)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("split.doneHint")}</p>
          <Button type="button" className="h-12 w-full text-base" onClick={() => void share()}>
            <Share2Icon />
            {t("split.share")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Segmented<Mode>
            aria-label={t("split.title")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "even", label: t("split.even") },
              { value: "custom", label: t("split.custom") },
            ]}
          />
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.name}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder={t("split.namePlaceholder", { n: i + 1 })}
                  aria-label={t("split.namePlaceholder", { n: i + 1 })}
                  className="h-11 flex-1"
                  maxLength={60}
                />
                {mode === "custom" ? (
                  <Input
                    value={r.amount}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    inputMode="decimal"
                    placeholder={currency === "USD" ? "$0.00" : "0៛"}
                    aria-label={t("split.amount")}
                    className="h-11 w-28 tabular-nums"
                  />
                ) : (
                  <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">{plan.shares[i] ? formatMoney(plan.shares[i].amount, currency) : ""}</span>
                )}
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("common.delete")} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            {rows.length < 20 && (
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setRows((rs) => [...rs, { name: "", amount: "" }])}>
                <PlusIcon />
                {t("split.addPerson")}
              </Button>
            )}
          </div>
          <div className="flex justify-between rounded-xl bg-muted px-3 py-2 text-sm">
            <span>{t("split.mine")}</span>
            <span className="font-semibold tabular-nums">{formatMoney(plan.mine, currency)}</span>
          </div>
          {currency === "KHR" && mode === "even" && <p className="text-xs text-muted-foreground">{t("split.rielNote")}</p>}
          <Button type="button" className="h-12 w-full text-base" disabled={!plan.ok || busy} onClick={() => void save()}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("split.save")}
          </Button>
        </div>
      )}
    </BottomSheet>
  )
}
