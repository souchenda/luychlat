"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HandCoinsIcon, Loader2Icon, SplitIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { CategoryFormSheet } from "@/components/categories/category-form-sheet"
import { CategoryPicker } from "@/components/categories/category-picker"
import { RecordedBy } from "@/components/family/member-avatar"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { ISLAMIC_KEYS, NON_OPERATING_KEYS } from "@/lib/categories/presets"
import { useFeatures } from "@/lib/features"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { budgetCrossing } from "@/lib/budgets"
import { usableWallets, useActiveWorkspace, useBudgets, useCategories, useProfile, useTransactionMutations, useTransactions, useWalletMutations } from "@/lib/data/hooks"
import { isGoal } from "@/lib/goals"
import { salarySaving } from "@/lib/salary-saving"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import { DebtLinkedError, type CategoryType, type Currency, type EntryInput, type Meal, type NeedWant, type Transaction, type Wallet } from "@/lib/data/types"
import { fromDateInput, monthKey, monthRange, toDateInput } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { savedMessage } from "@/lib/islamic-expressions"
import { convert, formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { defaultNeedWant } from "@/lib/need-want"
import { voiceDraft } from "@/lib/voice-entry"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { usePrefsStore } from "@/stores/prefs-store"

import { ReceiptField, type ReceiptValue } from "./receipt-field"
import { SplitSheet } from "./split-sheet"
import { VoiceEntryButton } from "./voice-entry-button"

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
  /**
   * A new entry may switch between expense and income at the top of the sheet (founder, 21/10/2026 — home's one
   * «កត់ត្រាចំណាយ» tile, now that the hero card has no separate «+ ចំណូល» button).
   */
  onTypeChange?: (type: CategoryType) => void
}

export function EntryFormSheet({ open, onOpenChange, workspaceId, wallets, type: newType, transaction, onTypeChange }: EntryFormSheetProps) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const categoriesQuery = useCategories(workspaceId)
  const mutations = useTransactionMutations(workspaceId)
  // This month's spending, for the budget line a new expense may cross (founder, 4/11/2026 — lib/budgets.ts budgetCrossing).
  const monthFilter = useMemo(() => ({ from: monthRange(monthKey()).from }), [])
  const budgets = useBudgets(open && newType === "EXPENSE" && !transaction ? workspaceId : undefined).data
  // …and this month's transfers into the goals, for the saving nudge after a salary (founder, 4/11/2026 — lib/salary-saving.ts).
  const monthTx = useTransactions(open && !transaction && ((newType === "EXPENSE" && budgets?.length) || newType === "INCOME") ? workspaceId : undefined, monthFilter).data
  const walletMutations = useWalletMutations(workspaceId)
  const { workspace: activeWorkspace } = useActiveWorkspace()
  const editing = Boolean(transaction)
  // Repayment rows: money fields are managed from the debt (see transactions_debt_guard).
  const debtLinked = Boolean(transaction?.debt_id)
  const type = (transaction?.type as CategoryType | undefined) ?? newType

  const [receipt, setReceipt] = useState<ReceiptValue>({ kind: "none" })
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  // «ចែកថ្លៃ» (founder, 9/11/2026): a saved expense shared with others — their parts become money owed to me.
  const [splitOpen, setSplitOpen] = useState(false)
  // Expenses: Need vs Want (reports) and, for food, the meal.
  const [needWant, setNeedWant] = useState<NeedWant | "NONE">("NONE")
  const [meal, setMeal] = useState<Meal | null>(null)
  // A new expense gets a smart Need / Want default (meals, rent… → need) until the user picks one.
  const [needWantTouched, setNeedWantTouched] = useState(false)
  // 🎤 What the voice note said, shown under the button so the person checks the filled sheet.
  const [heard, setHeard] = useState<string | null>(null)
  const voice = useFeatures().allowed("voice_entry") && !editing

  const islamic = useIslamicEnabled()
  // System categories (debt flows, balance adjustments) are only set by the app; keep the current one when editing.
  // Islamic categories (Zakat, Riba …) show only while the Islamic tools are on.
  const categories = useMemo(
    () =>
      categoriesQuery.data?.filter(
        (c) =>
          c.type === type &&
          (!c.preset_key || !NON_OPERATING_KEYS.has(c.preset_key) || c.id === transaction?.category_id) &&
          (islamic || !c.preset_key || !ISLAMIC_KEYS.has(c.preset_key) || c.id === transaction?.category_id),
      ) ?? [],
    [categoriesQuery.data, type, transaction?.category_id, islamic],
  )
  const me = useProfile().data?.id
  // Active wallets the user may spend from, plus the one this entry already uses.
  const selectable = useMemo(
    () =>
      wallets.filter(
        (w) => w.id === transaction?.wallet_id || (!w.archived_at && usableWallets([w], me).length > 0),
      ),
    [wallets, transaction?.wallet_id, me],
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
    setNeedWant(transaction?.need_want ?? "NONE")
    setMeal(transaction?.subcategory ?? null)
    setNeedWantTouched(Boolean(transaction))
    setHeard(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, transaction?.id])

  const [amountText, currency, walletId, categoryId] = useWatch({ control, name: ["amount", "currency", "walletId", "categoryId"] })
  const preset = categories.find((c) => c.id === categoryId)?.preset_key ?? null
  const isFood = type === "EXPENSE" && preset === "food"
  useEffect(() => {
    if (type !== "EXPENSE" || needWantTouched || !categoryId) return
    setNeedWant(defaultNeedWant({ preset, meal: isFood ? meal : null }) ?? "NONE")
  }, [type, needWantTouched, categoryId, preset, meal, isFood])
  const wallet = walletById.get(walletId)
  // Keep the rate an existing entry was recorded with; new entries use the configured rate.
  const rate = transaction?.exchange_rate ?? khrPerUsd
  const amount = parseAmount(amountText)
  const converted =
    wallet && currency !== wallet.currency && amount > 0
      ? amountInWalletCurrency(roundMoney(amount, currency), currency, rate, wallet.currency)
      : null

  const offerSaving = (from: Wallet, amount: number, currency: Currency) => {
    const goals = wallets.filter((w) => isGoal(w) && !w.archived_at && w.id !== from.id)
    const saved = (id: string) => (monthTx ?? []).filter((x) => x.type === "TRANSFER" && x.to_wallet_id === id).reduce((a, x) => a + Number(x.to_amount ?? x.amount), 0)
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
    const s = salarySaving({
      income: { amount: convert(amount, currency, from.currency, khrPerUsd), currency: from.currency },
      goals: goals.map((g) => ({ id: g.id, name: g.name, currency: g.currency, balance: g.balance, target: Number(g.goal_target), date: g.goal_date ?? null, savedThisMonth: saved(g.id) })),
      today,
      khrPerUsd,
    })
    if (!s) return
    const shown = formatMoney(s.toAmount, s.goalCurrency, { hidden: usePrefsStore.getState().hideBalances })
    toast(t("bot.saveGoalAsk", { amount: shown, goal: s.goalName }), {
      duration: 20_000,
      action: {
        label: t("bot.saveGoalYes"),
        onClick: () =>
          void walletMutations.transfer
            .mutateAsync({
              wallet_id: from.id,
              to_wallet_id: s.goalId,
              amount: s.fromAmount,
              to_amount: s.toAmount,
              exchange_rate: s.fromCurrency === s.goalCurrency ? null : khrPerUsd,
              note: `សន្សំ · ${s.goalName}`,
              transaction_date: new Date().toISOString(),
            })
            .then(
              () => toast.success(t("bot.saveGoalDone", { amount: shown, goal: s.goalName })),
              () => toast.error(t("bot.saveGoalFailed")),
            ),
      },
    })
  }

  const warnDuplicate = async (id: string) => {
    const { data } = (await getSupabaseBrowserClient()?.rpc("possible_duplicate", { p_tx_id: id })) ?? { data: null }
    const d = data as { status?: string; amount?: number | string; currency?: Currency; at?: string } | null
    if (d?.status !== "dup") return
    const time = d.at ? new Date(Date.parse(d.at) + 7 * 3_600_000).toISOString().slice(11, 16) : ""
    const amount = formatMoney(Number(d.amount), d.currency ?? "USD", { hidden: usePrefsStore.getState().hideBalances })
    toast.warning(t("entry.dupAsk", { amount, time }), {
      duration: 12_000,
      action: {
        label: t("entry.dupDelete"),
        onClick: () =>
          void mutations.remove.mutateAsync(id).then(
            () => toast.success(t("bot.dupDeleted", { amount })),
            () => toast.error(t("common.error")),
          ),
      },
    })
  }

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
        need_want: type === "EXPENSE" && needWant !== "NONE" ? needWant : null,
        subcategory: isFood ? meal : null,
      }
      const created = transaction ? null : await mutations.createEntry.mutateAsync(input)
      if (transaction) await mutations.update.mutateAsync({ id: transaction.id, input })
      // Islamic Mode: Alhamdulillah for income, Barakallahu Feek for a payment (lib/islamic-expressions).
      toast.success(t(savedMessage(type, islamic, !transaction)))
      // Recorded twice (the same payment typed, then from its slip)? Asked with one tap to delete — never silently
      // (founder, 4/11/2026 — public.possible_duplicate).
      if (created && type === "EXPENSE") void warnDuplicate(created.id)
      // A salary in a Personal book: the goal that needs money this month, one tap to move it — never moved without it.
      if (created && type === "INCOME" && activeWorkspace?.type === "PERSONAL" && categoriesQuery.data?.find((c) => c.id === v.categoryId)?.preset_key === "salary") offerSaving(target, input.amount, input.currency)
      // A new expense this month that takes its category past 70% or 100% of the budget: said once, at that moment.
      const cap = !transaction && type === "EXPENSE" ? budgets?.find((b) => b.category_id === v.categoryId) : undefined
      if (cap && monthTx && v.date.slice(0, 7) === monthKey()) {
        const spentBefore = monthTx.filter((x) => x.type === "EXPENSE" && x.category_id === cap.category_id).reduce((a, x) => a + convert(x.amount, x.currency, cap.currency, khrPerUsd), 0)
        const crossed = budgetCrossing({ cap: cap.amount, spentBefore, added: convert(input.amount, input.currency, cap.currency, khrPerUsd) })
        const name = categoriesQuery.data?.find((c) => c.id === cap.category_id)?.name ?? ""
        if (crossed) toast.warning(t(crossed.status === "over" ? "budget.crossOver" : "budget.crossNear", { category: name, percent: crossed.percent }), { duration: 8000 })
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof DebtLinkedError ? t("ledger.debtLinked") : t("common.error"))
    }
  })

  // The bot's parser on the words heard (lib/voice-entry.ts): the sheet is filled, never saved — the person taps Save.
  const fillFromVoice = (r: { heard: string; text: string }) => {
    const all = (categoriesQuery.data ?? []).filter((c) => !c.preset_key || !NON_OPERATING_KEYS.has(c.preset_key))
    const draft = voiceDraft(r.text, {
      wallets: selectable.map((w) => ({ id: w.id, name: w.name, currency: w.currency, kind: w.kind ?? null, icon: w.icon })),
      categories: all.map((c) => ({ id: c.id, name: c.name, type: c.type, preset_key: c.preset_key })),
      rate: khrPerUsd,
    })
    if (!draft) {
      setHeard(null)
      return toast.error(t("voice.noAmount"))
    }
    setHeard(r.heard)
    const sameKind = draft.type === type || Boolean(onTypeChange)
    if (draft.type !== type && onTypeChange) onTypeChange(draft.type)
    setValue("amount", String(draft.amount), { shouldValidate: true })
    setValue("currency", draft.currency)
    if (draft.walletId && walletById.has(draft.walletId)) setValue("walletId", draft.walletId)
    setValue("categoryId", sameKind && draft.categoryId ? draft.categoryId : "")
    setValue("note", draft.note)
  }

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
  const accent = type === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
        {selectable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("entry.noWallet")}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {transaction && <RecordedBy row={transaction} className="rounded-full bg-muted px-2.5 py-1" />}
            {debtLinked && transaction?.debt_id && (
              <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 p-3 text-sm">
                <HandCoinsIcon className="size-5 shrink-0 text-sky-600" />
                <span className="flex-1">{t("ledger.debtLinked")}</span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/debts/${transaction.debt_id}`}>{t("ledger.openDebt")}</Link>
                </Button>
              </div>
            )}
            {onTypeChange && !editing && (
              <Segmented
                aria-label={title}
                value={type}
                onChange={(next: CategoryType) => {
                  // The category list is the other kind's: start the category over.
                  setValue("categoryId", "")
                  onTypeChange(next)
                }}
                options={[
                  { value: "EXPENSE", label: t("tx.EXPENSE") },
                  { value: "INCOME", label: t("tx.INCOME") },
                ]}
              />
            )}
            {voice && (
              <div className="space-y-1.5">
                <VoiceEntryButton onHeard={fillFromVoice} />
                {heard && <p className="text-xs text-muted-foreground">{t("voice.heard", { text: heard })}</p>}
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

            {isFood && (
              <div className="space-y-2">
                <Label>{t("meal.label")}</Label>
                <div role="radiogroup" aria-label={t("meal.label")} className="flex flex-wrap gap-1.5">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={meal === m}
                      // Tap the chosen meal again to clear it.
                      onClick={() => setMeal((v) => (v === m ? null : m))}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm transition-all active:scale-95",
                        meal === m ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`meal.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {type === "EXPENSE" && (
              <div className="space-y-2">
                <Label>{t("nw.label")}</Label>
                <Segmented
                  aria-label={t("nw.label")}
                  value={needWant}
                  onChange={(v) => {
                    setNeedWantTouched(true)
                    setNeedWant(v)
                  }}
                  options={[
                    { value: "NONE", label: t("nw.none") },
                    { value: "NEED", label: t("nw.NEED") },
                    { value: "WANT", label: t("nw.WANT") },
                  ]}
                />
              </div>
            )}
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
                  placeholder={t(type === "INCOME" ? "entry.notePlaceholderIncome" : "entry.notePlaceholder")}
                  {...register("note")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t(type === "INCOME" ? "entry.receiptIncome" : "entry.receipt")}</Label>
              <ReceiptField value={receipt} onChange={setReceipt} />
            </div>

            <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              {t("common.save")}
            </Button>
            {editing && type === "EXPENSE" && !debtLinked && transaction && (
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setSplitOpen(true)}>
                <SplitIcon />
                {t("split.open")}
              </Button>
            )}
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
      <SplitSheet open={splitOpen} onOpenChange={setSplitOpen} workspaceId={workspaceId} transaction={transaction ?? null} />
    </>
  )
}
