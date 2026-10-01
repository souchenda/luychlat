"use client"

import { Loader2Icon, ScaleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTransactionMutations } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * កែតម្រូវសមតុល្យ: enter the real balance (e.g. counted cash or the bank app);
 * the difference is recorded as one "balance adjustment" ledger entry.
 */
export function ReconcileSheet({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  wallet: Wallet
}) {
  const t = useT()
  const { reconcile } = useTransactionMutations(wallet.workspace_id)
  const [actualText, setActualText] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (open) {
      setActualText(String(wallet.balance))
      setNote("")
    }
  }, [open, wallet.balance])

  const actual = parseAmount(actualText)
  const valid = !Number.isNaN(actual)
  const diff = valid ? roundMoney(actual - wallet.balance, wallet.currency) : 0

  const submit = async () => {
    if (!valid || diff === 0) return
    try {
      await reconcile.mutateAsync({
        walletId: wallet.id,
        actual: roundMoney(actual, wallet.currency),
        note: note.trim() || t("reconcile.defaultNote", { from: formatMoney(wallet.balance, wallet.currency), to: formatMoney(actual, wallet.currency) }),
      })
      toast.success(t("reconcile.done"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("reconcile.title")} description={wallet.name}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">{t("reconcile.recorded")}</span>
          <span className="font-semibold tabular-nums">{formatMoney(wallet.balance, wallet.currency)}</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reconcile-actual">{t("reconcile.actual", { currency: wallet.currency })}</Label>
          <Input
            id="reconcile-actual"
            className="h-12 text-lg font-semibold tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={actualText}
            onChange={(e) => setActualText(e.target.value)}
            aria-invalid={!valid}
          />
          {!valid && <p className="text-sm text-destructive">{t("walletForm.amountInvalid")}</p>}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ScaleIcon className="size-4" />
            {t("reconcile.difference")}
          </span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              diff > 0 && "text-emerald-600 dark:text-emerald-400",
              diff < 0 && "text-red-600 dark:text-red-400",
            )}
          >
            {formatMoney(diff, wallet.currency, { signed: true })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{diff === 0 ? t("reconcile.matches") : t("reconcile.hint")}</p>

        <div className="space-y-2">
          <Label htmlFor="reconcile-note">{t("entry.note")}</Label>
          <Input id="reconcile-note" maxLength={500} placeholder={t("reconcile.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button className="h-12 w-full text-base" onClick={submit} disabled={!valid || diff === 0 || reconcile.isPending}>
          {reconcile.isPending && <Loader2Icon className="animate-spin" />}
          {t("reconcile.submit")}
        </Button>
      </div>
    </BottomSheet>
  )
}
