"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { ReceiptField, type ReceiptValue } from "@/components/transactions/receipt-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { usableWallets, useDebtMutations, useProfile, useRepo, useTransactionMutations } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import type { Debt, Wallet } from "@/lib/data/types"
import { fromDateInput, toDateInput } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

const schema = z
  .object({
    amount: z.string(),
    moveMoney: z.boolean(),
    walletId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (!(parseAmount(v.amount) > 0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "walletForm.amountInvalid" })
    if (v.moveMoney && !v.walletId) ctx.addIssue({ code: "custom", path: ["walletId"], message: "transfer.select" })
  })
type FormValues = z.infer<typeof schema>

/** "ខ្ចីបន្ថែម": more money borrowed / lent later on the same debt; the total grows by it. */
export function TrancheSheet({
  open,
  onOpenChange,
  debt,
  wallets,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt: Debt
  wallets: Wallet[]
}) {
  const t = useT()
  const { repo } = useRepo()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { addTranche } = useDebtMutations(debt.workspace_id)
  const { uploadReceipt } = useTransactionMutations(debt.workspace_id)
  const me = useProfile().data?.id
  const active = useMemo(() => usableWallets(wallets, me).filter((w) => !w.archived_at), [wallets, me])
  const byId = useMemo(() => new Map(active.map((w) => [w.id, w])), [active])
  const [slip, setSlip] = useState<ReceiptValue>({ kind: "none" })

  const defaults = (): FormValues => ({
    amount: "",
    moveMoney: false,
    walletId: (active.find((w) => w.currency === debt.currency) ?? active[0])?.id ?? "",
    date: toDateInput(new Date().toISOString()),
    note: "",
  })
  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() })

  useEffect(() => {
    if (open) {
      reset(defaults())
      setSlip({ kind: "none" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open])

  const [amountText, walletId, moveMoney] = useWatch({ control, name: ["amount", "walletId", "moveMoney"] })
  const wallet = moveMoney ? byId.get(walletId) : undefined
  const amount = parseAmount(amountText)
  const converted =
    wallet && wallet.currency !== debt.currency && amount > 0
      ? amountInWalletCurrency(roundMoney(amount, debt.currency), debt.currency, khrPerUsd, wallet.currency)
      : null

  const onSubmit = handleSubmit(async (v) => {
    const target = v.moveMoney ? byId.get(v.walletId) : undefined
    if (v.moveMoney && !target) return
    let slipPath: string | null = null
    try {
      if (slip.kind === "new") slipPath = await uploadReceipt.mutateAsync(slip.blob)
      await addTranche.mutateAsync({
        debt_id: debt.id,
        amount: roundMoney(parseAmount(v.amount), debt.currency),
        date: fromDateInput(v.date),
        note: v.note.trim() || null,
        wallet_id: target?.id ?? null,
        exchange_rate: !target || target.currency === debt.currency ? null : khrPerUsd,
        attachment_path: slipPath,
      })
      toast.success(t("tranche.saved"))
      onOpenChange(false)
    } catch (error) {
      if (slipPath) await repo.deleteReceipt(slipPath).catch(() => {})
      toast.error(/installment/.test(String((error as Error)?.message)) ? t("tranche.installment") : t("common.error"))
    }
  })

  const amountError = formState.errors.amount?.message

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(`debt.addMore${debt.type}`)} description={debt.party_name}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tranche-amount">{t("tranche.amount", { currency: debt.currency })}</Label>
          <Input id="tranche-amount" className="h-14 text-2xl font-semibold tabular-nums" inputMode="decimal" autoComplete="off" {...register("amount")} />
          {amountError && <p className="text-sm text-destructive">{t(amountError as MessageKey)}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tranche-date">{t("entry.date")}</Label>
            <Input id="tranche-date" type="date" className="h-11" max="9999-12-31" {...register("date")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tranche-note">{t("entry.note")}</Label>
            <Input id="tranche-note" className="h-11" maxLength={500} {...register("note")} />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" {...register("moveMoney")} />
            <span>
              <span className="block font-medium">{t(`debtForm.moveMoney${debt.type}`)}</span>
              <span className="block text-xs text-muted-foreground">{t("debtForm.moveMoneyHint")}</span>
            </span>
          </label>
          {moveMoney &&
            (active.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("entry.noWallet")}</p>
            ) : (
              <div className="space-y-2">
                <Controller
                  control={control}
                  name="walletId"
                  render={({ field }) => (
                    <WalletSelect wallets={active} value={field.value} onChange={field.onChange} label={t(`debtForm.moveMoney${debt.type}`)} />
                  )}
                />
                {converted !== null && wallet && (
                  <p className="text-xs text-muted-foreground">
                    {t("entry.converted", { amount: formatMoney(converted, wallet.currency), rate: khrPerUsd.toLocaleString("en-US") })}
                  </p>
                )}
              </div>
            ))}
        </div>

        <div className="space-y-2">
          <Label>{t("repay.slip")}</Label>
          <ReceiptField value={slip} onChange={setSlip} />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting || (moveMoney && active.length === 0)}>
          {formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {t(`debt.addMore${debt.type}`)}
        </Button>
      </form>
    </BottomSheet>
  )
}
