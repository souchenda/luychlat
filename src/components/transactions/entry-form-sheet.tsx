"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HandCoinsIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { CategoryFormSheet } from "@/components/categories/category-form-sheet"
import { CategoryPicker } from "@/components/categories/category-picker"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { NON_OPERATING_KEYS } from "@/lib/categories/presets"
import { useCategories, useTransactionMutations } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import { DebtLinkedError, type CategoryType, type Currency, type EntryInput, type Transaction, type Wallet } from "@/lib/data/types"
import { fromDateInput, toDateInput } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

import { ReceiptField, type ReceiptValue } from "./receipt-field"

const schema = z.object({
  amount: z.string().refine((v) => parseAmount(v) > 0, "walletForm.amountInvalid"),
  currency: z.enum(["USD", "KHR"]),
  walletId: z.string().min(1, "transfer.select"),
  categoryId: z.string().min(1, "entry.categoryRequired"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "walletForm.amountInvalid"),
  note: z.string().max(500),
})
type FormValues = z.infer<typeof schema>

type EntryFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  /** All wallets of the workspace in sort order; the first active one is the default. */
  wallets: Wallet[]
  /** Kind for a new entry. */
  type: CategoryType
  /** Edit this income/expense instead of creating one. */
  transaction?: Transaction | null
}

export function EntryFormSheet({ open, onOpenChange, workspaceId, wallets, type: newType, transaction }: EntryFormSheetProps) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const categoriesQuery = useCategories(workspaceId)
  const mutations = useTransactionMutations(workspaceId)
  const editing = Boolean(transaction)
  // Repayment rows: money fields are managed from the debt (see transactions_debt_guard).
  const debtLinked = Boolean(transaction?.debt_id)
  const type = (transaction?.type as CategoryType | undefined) ?? newType

  const [receipt, setReceipt] = useState<ReceiptValue>({ kind: "none" })
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)

  // System categories (debt flows, balance adjustments) are only set by the app; keep the current one when editing.
  const categories = useMemo(
    () =>
      categoriesQuery.data?.filter(
        (c) =>
          c.type === type &&
          (!c.preset_key || !NON_OPERATING_KEYS.has(c.preset_key) || c.id === transaction?.category_id),
      ) ?? [],
    [categoriesQuery.data, type, transaction?.category_id],
  )
  // Active wallets, plus an archived one this entry already uses.
  const selectable = useMemo(
    () => wallets.filter((w) => !w.archived_at || w.id === transaction?.wallet_id),
    [wallets, transaction?.wallet_id],
  )
  const walletById = useMemo(() => new Map(selectable.map((w) => [w.id, w])), [selectable])

  const defaults = (): FormValues => {
    if (transaction) {
      return {
        amount: String(transaction.amount),
        currency: transaction.currency,
        walletId: transaction.wallet_id,
        categoryId: transaction.category_id ?? "",
        date: toDateInput(transaction.transaction_date),
        note: transaction.note ?? "",
      }
    }
    const primary = selectable[0]
    return {
      amount: "",
      currency: primary?.currency ?? "USD",
      walletId: primary?.id ?? "",
      categoryId: "",
      date: toDateInput(new Date().toISOString()),
      note: "",
    }
  }

  const { control, register, handleSubmit, reset, setValue, getValues, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })

  useEffect(() => {
    if (!open) return
    reset(defaults())
    setReceipt(transaction?.receipt_url ? { kind: "saved", ref: transaction.receipt_url } : { kind: "none" })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, transaction?.id])

  const [amountText, currency, walletId] = useWatch({ control, name: ["amount", "currency", "walletId"] })
  const wallet = walletById.get(walletId)
  // Keep the rate an existing entry was recorded with; new entries use the configured rate.
  const rate = transaction?.exchange_rate ?? khrPerUsd
  const amount = parseAmount(amountText)
  const converted =
    wallet && currency !== wallet.currency && amount > 0
      ? amountInWalletCurrency(roundMoney(amount, currency), currency, rate, wallet.currency)
      : null

  const onSubmit = handleSubmit(async (v) => {
    const target = walletById.get(v.walletId)
    if (!target) return
    try {
      let receiptRef: string | null = null
      if (receipt.kind === "saved") receiptRef = receipt.ref
      if (receipt.kind === "new") receiptRef = await mutations.uploadReceipt.mutateAsync(receipt.blob)

      const input: EntryInput = {
        type,
        wallet_id: target.id,
        category_id: v.categoryId,
        amount: roundMoney(parseAmount(v.amount), v.currency),
        currency: v.currency,
        exchange_rate: v.currency === target.currency ? null : rate,
        note: v.note.trim() || null,
        transaction_date: fromDateInput(v.date, transaction?.transaction_date),
        receipt_url: receiptRef,
      }
      if (transaction) await mutations.update.mutateAsync({ id: transaction.id, input })
      else await mutations.createEntry.mutateAsync(input)
      toast.success(t("entry.saved"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof DebtLinkedError ? t("ledger.debtLinked") : t("common.error"))
    }
  })

  const remove = async () => {
    if (!transaction || !window.confirm(t("entry.deleteConfirm"))) return
    try {
      await mutations.remove.mutateAsync(transaction.id)
      toast.success(t("entry.deleted"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const err = (message?: string) =>
    message ? <p className="text-sm text-destructive">{t(message as MessageKey)}</p> : null
  const title = editing ? t(`entry.edit${type}`) : t(`entry.new${type}`)
  const accent = type === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
        {selectable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("entry.noWallet")}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {debtLinked && transaction?.debt_id && (
              <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 p-3 text-sm">
                <HandCoinsIcon className="size-5 shrink-0 text-sky-600" />
                <span className="flex-1">{t("ledger.debtLinked")}</span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/debts/${transaction.debt_id}`}>{t("ledger.openDebt")}</Link>
                </Button>
              </div>
            )}
            <fieldset disabled={debtLinked} className="space-y-4 disabled:opacity-60">
            <div className="space-y-2">
              <Label htmlFor="entry-amount">{t("entry.amount")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="entry-amount"
                  className={cn("h-14 flex-1 text-2xl font-semibold tabular-nums", accent)}
                  inputMode="decimal"
                  placeholder="0"
                  autoComplete="off"
                  autoFocus={!editing}
                  {...register("amount")}
                />
                <div className="w-32">
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field }) => (
                      <Segmented
                        aria-label={t("walletForm.currency")}
                        value={field.value}
                        onChange={(c: Currency) => field.onChange(c)}
                        options={[
                          { value: "USD", label: "$" },
                          { value: "KHR", label: "៛" },
                        ]}
                      />
                    )}
                  />
                </div>
              </div>
              {err(formState.errors.amount?.message)}
              {converted !== null && wallet && (
                <p className="text-xs text-muted-foreground">
                  {t("entry.converted", {
                    amount: formatMoney(converted, wallet.currency),
                    rate: rate.toLocaleString("en-US"),
                  })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("entry.wallet")}</Label>
              <Controller
                control={control}
                name="walletId"
                render={({ field }) => (
                  <WalletSelect
                    wallets={selectable}
                    value={field.value}
                    label={t("entry.wallet")}
                    onChange={(id) => {
                      field.onChange(id)
                      // Nothing typed yet: follow the wallet's currency.
                      const next = walletById.get(id)
                      if (next && !getValues("amount")) setValue("currency", next.currency)
                    }}
                  />
                )}
              />
              {err(formState.errors.walletId?.message)}
            </div>

            <div className="space-y-2">
              <Label>{t("entry.category")}</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <CategoryPicker
                    categories={categories}
                    value={field.value}
                    onChange={field.onChange}
                    onAdd={() => setCategoryFormOpen(true)}
                  />
                )}
              />
              {err(formState.errors.categoryId?.message)}
            </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="entry-date">{t("entry.date")}</Label>
                <Input id="entry-date" type="date" className="h-11" max="9999-12-31" {...register("date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-note">{t("entry.note")}</Label>
                <Input
                  id="entry-note"
                  className="h-11"
                  maxLength={500}
                  placeholder={t("entry.notePlaceholder")}
                  {...register("note")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("entry.receipt")}</Label>
              <ReceiptField value={receipt} onChange={setReceipt} />
            </div>

            <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              {t("common.save")}
            </Button>
            {editing && (
              <Button type="button" variant="outline" className="w-full text-destructive" onClick={remove}>
                <Trash2Icon />
                {t("common.delete")}
              </Button>
            )}
          </form>
        )}
      </BottomSheet>

      <CategoryFormSheet
        open={categoryFormOpen}
        onOpenChange={setCategoryFormOpen}
        workspaceId={workspaceId}
        defaultType={type}
        typeLocked
        onSaved={(c) => setValue("categoryId", c.id, { shouldValidate: true })}
      />
    </>
  )
}
