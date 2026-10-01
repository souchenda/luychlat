"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDownIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTransactionMutations, useWalletMutations } from "@/lib/data/hooks"
import { InsufficientBalanceError, type Currency, type Transaction, type Wallet } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletSelect } from "./wallet-select"

/** Converts with an explicit KHR-per-USD rate. */
function convertWithRate(amount: number, from: Currency, to: Currency, khrPerUsd: number) {
  if (from === to) return amount
  return roundMoney(from === "USD" ? amount * khrPerUsd : amount / khrPerUsd, to)
}

/** Balance available to send; when editing, the original transfer is given back first. */
function available(wallet: Wallet, editing: Transaction | null | undefined) {
  return wallet.balance + (editing?.wallet_id === wallet.id ? editing.amount : 0)
}

function buildSchema(wallets: Map<string, Wallet>, editing: Transaction | null | undefined) {
  return z
    .object({
      from: z.string().min(1, "transfer.select"),
      to: z.string().min(1, "transfer.select"),
      amount: z.string(),
      rate: z.string(),
      note: z.string().max(500),
    })
    .superRefine((v, ctx) => {
      const from = wallets.get(v.from)
      const to = wallets.get(v.to)
      if (v.from && v.from === v.to) ctx.addIssue({ code: "custom", path: ["to"], message: "transfer.sameWallet" })
      const amount = parseAmount(v.amount)
      if (!(amount > 0)) return ctx.addIssue({ code: "custom", path: ["amount"], message: "walletForm.amountInvalid" })
      if (from && amount > available(from, editing)) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "transfer.insufficient" })
      }
      if (from && to && from.currency !== to.currency) {
        const rate = parseAmount(v.rate)
        if (!(rate > 0)) return ctx.addIssue({ code: "custom", path: ["rate"], message: "walletForm.amountInvalid" })
        if (!(convertWithRate(amount, from.currency, to.currency, rate) > 0)) {
          ctx.addIssue({ code: "custom", path: ["amount"], message: "walletForm.amountInvalid" })
        }
      }
    })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

type TransferSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  /** All wallets of the workspace; archived ones are only offered when the edited transfer uses them. */
  wallets: Wallet[]
  /** Edit this transfer instead of creating one. */
  transaction?: Transaction | null
}

export function TransferSheet({ open, onOpenChange, workspaceId, wallets, transaction }: TransferSheetProps) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { transfer } = useWalletMutations(workspaceId)
  const txMutations = useTransactionMutations(workspaceId)
  const selectable = useMemo(
    () =>
      wallets.filter(
        (w) => !w.archived_at || w.id === transaction?.wallet_id || w.id === transaction?.to_wallet_id,
      ),
    [wallets, transaction],
  )
  const byId = useMemo(() => new Map(selectable.map((w) => [w.id, w])), [selectable])
  const schema = useMemo(() => buildSchema(byId, transaction), [byId, transaction])

  const defaults = (): FormValues => {
    if (transaction) {
      return {
        from: transaction.wallet_id,
        to: transaction.to_wallet_id ?? "",
        amount: String(transaction.amount),
        rate: String(transaction.exchange_rate ?? khrPerUsd),
        note: transaction.note ?? "",
      }
    }
    const from = selectable[0]?.id ?? ""
    return { from, to: selectable.find((w) => w.id !== from)?.id ?? "", amount: "", rate: String(khrPerUsd), note: "" }
  }
  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, transaction?.id])

  const [fromId, toId, amountText, rateText] = useWatch({ control, name: ["from", "to", "amount", "rate"] })
  const from = byId.get(fromId)
  const to = byId.get(toId)
  const crossCurrency = Boolean(from && to && from.currency !== to.currency)
  const amount = parseAmount(amountText)
  const rate = parseAmount(rateText)
  const preview = from && to && amount > 0 && rate > 0 ? convertWithRate(amount, from.currency, to.currency, rate) : null

  const onSubmit = handleSubmit(async (v) => {
    const source = byId.get(v.from)!
    const target = byId.get(v.to)!
    const sent = roundMoney(parseAmount(v.amount), source.currency)
    const khrRate = parseAmount(v.rate)
    const input = {
      wallet_id: source.id,
      to_wallet_id: target.id,
      amount: sent,
      to_amount: convertWithRate(sent, source.currency, target.currency, khrRate),
      exchange_rate: source.currency === target.currency ? null : khrRate,
      note: v.note.trim() || null,
      transaction_date: transaction?.transaction_date ?? new Date().toISOString(),
    }
    try {
      if (transaction) {
        await txMutations.update.mutateAsync({ id: transaction.id, input: { ...input, type: "TRANSFER" } })
      } else {
        await transfer.mutateAsync(input)
      }
      toast.success(t("transfer.success"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof InsufficientBalanceError ? t("transfer.insufficient") : t("common.error"))
    }
  })

  const remove = async () => {
    if (!transaction || !window.confirm(t("entry.deleteConfirm"))) return
    try {
      await txMutations.remove.mutateAsync(transaction.id)
      toast.success(t("entry.deleted"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const err = (message?: string) =>
    message ? <p className="text-sm text-destructive">{t(message as MessageKey)}</p> : null

  const walletField = (name: "from" | "to", label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => <WalletSelect wallets={selectable} value={field.value} onChange={field.onChange} label={label} />}
      />
      {err(formState.errors[name]?.message)}
    </div>
  )

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={transaction ? t("transfer.editTitle") : t("transfer.title")}>
      {selectable.length < 2 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("transfer.needTwo")}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {walletField("from", t("transfer.from"))}
          <div className="flex justify-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted">
              <ArrowDownIcon className="size-4" />
            </span>
          </div>
          {walletField("to", t("transfer.to"))}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="transfer-amount">
                {t("transfer.amount")} {from && `(${from.currency})`}
              </Label>
              {from && (
                <span className="text-xs text-muted-foreground">
                  {t("transfer.available", { amount: formatMoney(available(from, transaction), from.currency) })}
                </span>
              )}
            </div>
            <Input
              id="transfer-amount"
              className="h-12 text-lg tabular-nums"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              {...register("amount")}
            />
            {err(formState.errors.amount?.message)}
          </div>

          {crossCurrency && (
            <div className="space-y-2 rounded-xl bg-muted/60 p-3">
              <Label htmlFor="transfer-rate">{t("transfer.rate")}</Label>
              <Input id="transfer-rate" className="h-10 bg-background tabular-nums" inputMode="decimal" {...register("rate")} />
              {err(formState.errors.rate?.message)}
              {to && preview !== null && (
                <p className="text-sm">
                  {t("transfer.receive")}: <strong className="tabular-nums">{formatMoney(preview, to.currency)}</strong>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="transfer-note">{t("transfer.note")}</Label>
            <Input id="transfer-note" maxLength={500} placeholder={t("transfer.notePlaceholder")} {...register("note")} />
          </div>

          <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
            {transaction ? t("common.save") : t("transfer.submit")}
          </Button>
          {transaction && (
            <Button type="button" variant="outline" className="w-full text-destructive" onClick={remove}>
              <Trash2Icon />
              {t("common.delete")}
            </Button>
          )}
        </form>
      )}
    </BottomSheet>
  )
}
