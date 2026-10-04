"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDownLeftIcon, ArrowUpRightIcon, Loader2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ReceiptField, type ReceiptValue } from "@/components/transactions/receipt-field"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { usableWallets, useDebtMutations, useTransactionMutations, useProfile, useRepo } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import { RepaymentTooLargeError, type Debt, type Wallet } from "@/lib/data/types"
import { fromDateInput, toDateInput } from "@/lib/dates"
import { remaining } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

function buildSchema(max: number) {
  return z
    .object({
      amount: z.string(),
      /** Off: record only (an earlier repayment) — no wallet, no ledger row. */
      moveMoney: z.boolean(),
      walletId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      note: z.string().max(500),
    })
    .superRefine((v, ctx) => {
      const amount = parseAmount(v.amount)
      if (!(amount > 0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "walletForm.amountInvalid" })
      else if (amount > max) ctx.addIssue({ code: "custom", path: ["amount"], message: "repay.tooLarge" })
      if (v.moveMoney && !v.walletId) ctx.addIssue({ code: "custom", path: ["walletId"], message: "transfer.select" })
    })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

/**
 * Partial or full repayment: a payable takes money out of the wallet, a receivable puts it in.
 * Unticking "move money" records an earlier repayment for the history only.
 */
export function RepaymentSheet({
  open,
  onOpenChange,
  debt,
  wallets,
  initialAmount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt: Debt
  /** All wallets of the workspace; archived ones are hidden. */
  wallets: Wallet[]
  /** Pre-filled amount (e.g. the next installment); defaults to everything left. */
  initialAmount?: number
}) {
  const t = useT()
  const { repo } = useRepo()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { recordRepayment } = useDebtMutations(debt.workspace_id)
  const { uploadReceipt } = useTransactionMutations(debt.workspace_id)
  const [slip, setSlip] = useState<ReceiptValue>({ kind: "none" })
  const left = remaining(debt)
  const schema = useMemo(() => buildSchema(left), [left])
  const me = useProfile().data?.id
  const active = useMemo(() => usableWallets(wallets, me).filter((w) => !w.archived_at), [wallets, me])
  const byId = useMemo(() => new Map(active.map((w) => [w.id, w])), [active])

  const defaults = (): FormValues => ({
    amount: String(initialAmount !== undefined && initialAmount > 0 ? Math.min(initialAmount, left) : left),
    moveMoney: active.length > 0,
    // Prefer a wallet in the debt's currency.
    walletId: (active.find((w) => w.currency === debt.currency) ?? active[0])?.id ?? "",
    date: toDateInput(new Date().toISOString()),
    note: "",
  })
  const { control, register, handleSubmit, reset, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })

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
    const paid = roundMoney(parseAmount(v.amount), debt.currency)
    let slipPath: string | null = null
    try {
      if (slip.kind === "new") slipPath = await uploadReceipt.mutateAsync(slip.blob)
      await recordRepayment.mutateAsync({
        debt_id: debt.id,
        wallet_id: target?.id ?? null,
        amount: paid,
        exchange_rate: !target || target.currency === debt.currency ? null : khrPerUsd,
        payment_date: fromDateInput(v.date),
        note: v.note.trim() || null,
        attachment_path: slipPath,
      })
      toast.success(paid >= left ? t("repay.settled") : t("repay.saved"))
      onOpenChange(false)
    } catch (error) {
      if (slipPath) await repo.deleteReceipt(slipPath).catch(() => {})
      toast.error(
        error instanceof RepaymentTooLargeError
          ? t("repay.tooLarge", { amount: formatMoney(left, debt.currency) })
          : t("common.error"),
      )
    }
  })

  const amountError = formState.errors.amount?.message
  const quick = (value: number) => setValue("amount", String(roundMoney(value, debt.currency)), { shouldValidate: true })

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(`repay.title${debt.type}`)} description={debt.party_name}>
      <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repay-amount">{t("repay.amount", { currency: debt.currency })}</Label>
            <Input
              id="repay-amount"
              className="h-14 text-2xl font-semibold tabular-nums"
              inputMode="decimal"
              autoComplete="off"
              {...register("amount")}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => quick(left)}>
                {t("repay.full", { amount: formatMoney(left, debt.currency) })}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => quick(left / 2)}>
                {t("repay.half")}
              </Button>
            </div>
            {amountError && (
              <p className="text-sm text-destructive">
                {t(amountError as MessageKey, { amount: formatMoney(left, debt.currency) })}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                {...register("moveMoney", {
                  onChange: (e) => {
                    if (e.target.checked && !walletId) {
                      const preferred = active.find((w) => w.currency === debt.currency) ?? active[0]
                      if (preferred) setValue("walletId", preferred.id)
                    }
                  },
                })}
              />
              <span>
                <span className="block font-medium">{t(`repay.moveMoney${debt.type}`)}</span>
                <span className="block text-xs text-muted-foreground">{t("repay.moveMoneyHint")}</span>
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
                      <WalletSelect wallets={active} value={field.value} onChange={field.onChange} label={t(`repay.wallet${debt.type}`)} />
                    )}
                  />
                  {converted !== null && wallet && (
                    <p className="text-xs text-muted-foreground">
                      {t("entry.converted", {
                        amount: formatMoney(converted, wallet.currency),
                        rate: khrPerUsd.toLocaleString("en-US"),
                      })}
                    </p>
                  )}
                </div>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="repay-date">{t("entry.date")}</Label>
              <Input id="repay-date" type="date" className="h-11" max="9999-12-31" {...register("date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repay-note">{t("entry.note")}</Label>
              <Input id="repay-note" className="h-11" maxLength={500} {...register("note")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("repay.slip")}</Label>
            <ReceiptField value={slip} onChange={setSlip} />
          </div>

          <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting || (moveMoney && active.length === 0)}>
            {formState.isSubmitting ? (
              <Loader2Icon className="animate-spin" />
            ) : debt.type === "PAYABLE" ? (
              <ArrowUpRightIcon />
            ) : (
              <ArrowDownLeftIcon />
            )}
            {t(`debt.record${debt.type}`)}
          </Button>
      </form>
    </BottomSheet>
  )
}
