"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDownLeftIcon, CrownIcon, ArrowUpRightIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { computeSchedule, MAX_MONTHS } from "@/lib/loans/amortization"
import { scheduleToSave } from "@/lib/loans/installments"
import { showUpgrade, usePlan } from "@/lib/plan"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { usableWallets, useDebtMutations, useProfile, useWallets } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import type { Debt, DebtDisbursement, DebtInput, DebtType } from "@/lib/data/types"
import { fromDateInput } from "@/lib/dates"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { INSURERS } from "@/lib/insurance"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { formatNationalNumber, isValidNationalNumber, KH_COUNTRY_CODE, toE164, toNationalNumber } from "@/lib/phone"
import { usePrefsStore } from "@/stores/prefs-store"

function buildSchema(paid: number) {
  return z
    .object({
      type: z.enum(["PAYABLE", "RECEIVABLE"]),
      party: z.string().trim().min(1, "debtForm.partyRequired").max(100),
      phone: z.string(),
      total: z.string(),
      currency: z.enum(["USD", "KHR"]),
      interest: z.string(),
      interestPeriod: z.enum(["YEAR", "MONTH"]),
      /** Qard Hasan: an interest-free loan (interest fields hidden, saved as 0). */
      qardHasan: z.boolean(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: z.string(),
      note: z.string().max(500),
      /** Move the money now (off by default: tracking an existing debt shouldn't touch wallets). */
      moveMoney: z.boolean(),
      walletId: z.string(),
      /** Optional loan insurance (borrowed money only). */
      insured: z.boolean(),
      insurer: z.string().max(60),
      policyNo: z.string().max(60),
      premium: z.string(),
      premiumCurrency: z.enum(["USD", "KHR"]),
      renewal: z.string(),
      /** Installment schedule (PRO): equal payments every month or week. */
      schedOn: z.boolean(),
      schedFrequency: z.enum(["MONTHLY", "WEEKLY"]),
      schedCount: z.string(),
      schedMethod: z.enum(["BANK", "REDUCING", "FLAT"]),
      schedFirst: z.string(),
      /** Bank loan: monthly fee / insurance. */
      schedFee: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.moveMoney && !v.walletId) ctx.addIssue({ code: "custom", path: ["walletId"], message: "transfer.select" })
      const total = parseAmount(v.total)
      if (!(total > 0)) ctx.addIssue({ code: "custom", path: ["total"], message: "walletForm.amountInvalid" })
      // With a schedule the total to repay includes interest (checked when saving); a bank loan's total is the principal.
      else if (total < paid && (!v.schedOn || v.schedMethod === "BANK")) ctx.addIssue({ code: "custom", path: ["total"], message: "debtForm.totalBelowPaid" })
      if (v.interest && !(parseAmount(v.interest) >= 0)) {
        ctx.addIssue({ code: "custom", path: ["interest"], message: "walletForm.amountInvalid" })
      }
      if (v.phone && !isValidNationalNumber(v.phone)) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "login.invalidPhone" })
      }
      if (v.insured && v.premium && !(parseAmount(v.premium) >= 0)) {
        ctx.addIssue({ code: "custom", path: ["premium"], message: "walletForm.amountInvalid" })
      }
      if (v.schedOn && v.schedMethod === "BANK" && v.schedFee && !(parseAmount(v.schedFee) >= 0)) {
        ctx.addIssue({ code: "custom", path: ["schedFee"], message: "walletForm.amountInvalid" })
      }
      if (v.dueDate && v.dueDate < v.startDate) {
        ctx.addIssue({ code: "custom", path: ["dueDate"], message: "debtForm.dueBeforeStart" })
      }
    })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

type DebtFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  defaultType?: DebtType
  debt?: Debt | null
  onSaved?: (debt: Debt) => void
  /** Pre-filled values for a new debt (e.g. from the loan calculator). */
  prefill?: Partial<DebtInput>
  /** When moving money for a new debt, move this amount instead of the total (a loan's principal). */
  disbursementAmount?: number
}

export function DebtFormSheet({
  open,
  onOpenChange,
  workspaceId,
  defaultType = "PAYABLE",
  debt,
  onSaved,
  prefill,
  disbursementAmount,
}: DebtFormSheetProps) {
  const t = useT()
  const mutations = useDebtMutations(workspaceId)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const me = useProfile().data?.id
  const activeWallets = usableWallets(useWallets(workspaceId).data ?? [], me).filter((w) => !w.archived_at)
  const paid = debt?.paid_amount ?? 0
  const schema = useMemo(() => buildSchema(paid), [paid])

  const defaults = (): FormValues =>
    debt
      ? {
          type: debt.type,
          party: debt.party_name,
          phone: debt.contact_phone ? toNationalNumber(debt.contact_phone) : "",
          total: String(debt.schedule_principal ?? debt.total_amount),
          currency: debt.currency,
          interest: debt.interest_rate ? String(debt.interest_rate) : "",
          interestPeriod: debt.interest_period,
          qardHasan: debt.qard_hasan ?? false,
          startDate: debt.start_date,
          dueDate: debt.due_date ?? "",
          note: debt.note ?? "",
          moveMoney: false,
          walletId: "",
          insured: debt.insured ?? false,
          insurer: debt.insurer ?? "",
          policyNo: debt.insurance_policy_no ?? "",
          premium: debt.insurance_premium != null ? String(debt.insurance_premium) : "",
          premiumCurrency: debt.insurance_currency ?? debt.currency,
          renewal: debt.insurance_renewal_date ?? "",
          schedOn: Boolean(debt.schedule_frequency),
          schedFrequency: debt.schedule_frequency ?? "MONTHLY",
          schedCount: debt.schedule_count ? String(debt.schedule_count) : "12",
          schedMethod: debt.schedule_method ?? "REDUCING",
          schedFirst: debt.schedule_first_due ?? "",
          schedFee: debt.schedule_fee ? String(debt.schedule_fee) : "",
        }
      : {
          type: prefill?.type ?? defaultType,
          party: prefill?.party_name ?? "",
          phone: "",
          total: prefill?.total_amount ? String(prefill.total_amount) : "",
          currency: prefill?.currency ?? "USD",
          interest: prefill?.interest_rate ? String(prefill.interest_rate) : "",
          interestPeriod: prefill?.interest_period ?? "YEAR",
          qardHasan: false,
          startDate: prefill?.start_date ?? todayDate(),
          dueDate: prefill?.due_date ?? "",
          note: prefill?.note ?? "",
          moveMoney: false,
          walletId: "",
          insured: false,
          insurer: "",
          policyNo: "",
          premium: "",
          premiumCurrency: prefill?.currency ?? "USD",
          renewal: "",
          schedOn: false,
          schedFrequency: "MONTHLY",
          schedCount: "12",
          schedMethod: "REDUCING",
          schedFirst: "",
          schedFee: "",
        }

  const { control, register, handleSubmit, reset, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })

  const [selectedType, moveMoney, walletId, totalText, currency, insured, qardHasan] = useWatch({
    control,
    name: ["type", "moveMoney", "walletId", "total", "currency", "insured", "qardHasan"],
  })
  const [schedOn, schedFrequency, schedCountText, schedMethod, schedFirst, interestText, interestPeriod, startDate, schedFee] = useWatch({
    control,
    name: ["schedOn", "schedFrequency", "schedCount", "schedMethod", "schedFirst", "interest", "interestPeriod", "startDate", "schedFee"],
  })
  // A bank loan is always monthly.
  const bank = schedMethod === "BANK"
  const { isPro } = usePlan()
  // Live preview of the installments (also what gets saved).
  const schedulePreview = useMemo(() => {
    const principal = parseAmount(totalText)
    const count = Number(schedCountText)
    if (!schedOn || !(principal > 0) || !Number.isInteger(count) || count < 1 || count > MAX_MONTHS) return null
    return computeSchedule({
      principal: roundMoney(principal, currency),
      currency,
      rate: qardHasan ? 0 : parseAmount(interestText || "0") || 0,
      ratePeriod: interestPeriod,
      months: count,
      method: schedMethod,
      frequency: bank ? "MONTHLY" : schedFrequency,
      firstPaymentDate: schedFirst || startDate,
      startDate,
      fee: bank ? parseAmount(schedFee || "0") || 0 : 0,
    })
  }, [schedOn, totalText, schedCountText, currency, qardHasan, interestText, interestPeriod, schedMethod, schedFrequency, schedFirst, startDate, schedFee, bank])
  const moneyWallet = activeWallets.find((w) => w.id === walletId)
  const totalValue = disbursementAmount ?? parseAmount(totalText)
  const moneyConverted =
    moneyWallet && moneyWallet.currency !== currency && totalValue > 0
      ? amountInWalletCurrency(roundMoney(totalValue, currency), currency, khrPerUsd, moneyWallet.currency)
      : null

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, debt?.id])

  const onSubmit = handleSubmit(async (v) => {
    if (v.schedOn && !schedulePreview) return void toast.error(t("schedule.invalid"))
    if (v.schedOn && v.schedMethod !== "BANK" && schedulePreview && schedulePreview.totalPayment < paid) {
      return void toast.error(t("debtForm.totalBelowPaid", { amount: formatMoney(paid, v.currency) }))
    }
    const scheduleFields =
      v.schedOn && schedulePreview
        ? scheduleToSave(schedulePreview, {
            frequency: v.schedMethod === "BANK" ? "MONTHLY" : v.schedFrequency,
            count: Number(v.schedCount),
            method: v.schedMethod,
            firstDue: v.schedFirst || v.startDate,
            principal: roundMoney(parseAmount(v.total), v.currency),
            fee: v.schedMethod === "BANK" && v.schedFee ? roundMoney(parseAmount(v.schedFee), v.currency) : 0,
          })
        : debt?.schedule_frequency
          ? // Schedule removed: back to a plain debt of the amount entered.
            { schedule_frequency: null, schedule_count: null, schedule_method: null, schedule_first_due: null, schedule_payment: null, schedule_principal: null, schedule_fee: null }
          : {}
    const input: DebtInput = {
      type: v.type,
      party_name: v.party.trim(),
      contact_phone: v.phone ? toE164(v.phone) : null,
      total_amount: roundMoney(parseAmount(v.total), v.currency),
      currency: v.currency,
      interest_rate: v.qardHasan || !v.interest ? 0 : parseAmount(v.interest),
      interest_period: v.interestPeriod,
      // Only sent when used, so saving works before the Phase A migration is applied.
      ...(v.qardHasan || debt?.qard_hasan ? { qard_hasan: v.qardHasan } : {}),
      start_date: v.startDate,
      due_date: v.dueDate || null,
      note: v.note.trim() || null,
      // Loan insurance applies to money we borrowed; cleared otherwise.
      ...(v.type === "PAYABLE" && v.insured
        ? {
            insured: true,
            insurer: v.insurer.trim() || null,
            insurance_policy_no: v.policyNo.trim() || null,
            insurance_premium: v.premium ? roundMoney(parseAmount(v.premium), v.premiumCurrency) : null,
            insurance_currency: v.premium ? v.premiumCurrency : null,
            insurance_renewal_date: v.renewal || null,
          }
        : { insured: false, insurer: null, insurance_policy_no: null, insurance_premium: null, insurance_currency: null, insurance_renewal_date: null }),
      // With a schedule: total = everything to repay, due date = last installment.
      ...scheduleFields,
    }
    const target = activeWallets.find((w) => w.id === v.walletId)
    const disbursement: DebtDisbursement | undefined =
      !debt && v.moveMoney && target
        ? {
            wallet_id: target.id,
            exchange_rate: target.currency === v.currency ? null : khrPerUsd,
            date: fromDateInput(v.startDate),
            // Never more than the (possibly edited) total.
            amount: disbursementAmount !== undefined ? Math.min(disbursementAmount, input.total_amount) : undefined,
          }
        : undefined
    try {
      const saved = debt
        ? await mutations.update.mutateAsync({ id: debt.id, input })
        : await mutations.create.mutateAsync({ input, disbursement })
      toast.success(t("debtForm.saved"))
      onOpenChange(false)
      onSaved?.(saved)
    } catch (error) {
      if (/plan_required/.test(String((error as Error)?.message))) showUpgrade("general")
      else toast.error(t("common.error"))
    }
  })

  const err = (key: keyof FormValues) => {
    const message = formState.errors[key]?.message
    if (!message) return null
    const params = message === "debtForm.totalBelowPaid" && debt ? { amount: formatMoney(paid, debt.currency) } : undefined
    return <p className="text-sm text-destructive">{t(message as MessageKey, params)}</p>
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? t("debtForm.edit") : t(`debtForm.new${selectedType}`)}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!debt && (
          <div className="space-y-2">
            <Label>{t("debtForm.type")}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Segmented
                  aria-label={t("debtForm.type")}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "PAYABLE", label: <span className="inline-flex items-center gap-1"><ArrowUpRightIcon className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden />{t("debts.PAYABLE")}</span> },
                    { value: "RECEIVABLE", label: <span className="inline-flex items-center gap-1"><ArrowDownLeftIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />{t("debts.RECEIVABLE")}</span> },
                  ]}
                />
              )}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="debt-party">{t("debtForm.party")}</Label>
          <Input
            id="debt-party"
            className="h-11"
            maxLength={100}
            placeholder={t("debtForm.partyPlaceholder")}
            autoFocus={!debt}
            {...register("party")}
          />
          {err("party")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="debt-phone">{t("debtForm.phone")}</Label>
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <div className="flex h-11 items-center rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <span className="border-r px-3 text-sm text-muted-foreground">{KH_COUNTRY_CODE}</span>
                <input
                  id="debt-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="12 345 678"
                  value={formatNationalNumber(field.value)}
                  onChange={(e) => field.onChange(toNationalNumber(e.target.value))}
                  className="h-full flex-1 bg-transparent px-3 text-base outline-none"
                />
              </div>
            )}
          />
          {err("phone")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="debt-total">{t(schedOn ? "schedule.principal" : "debtForm.total")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="debt-total"
              className="h-12 flex-1 text-lg font-semibold tabular-nums"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              {...register("total")}
            />
            <div className="w-32">
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Segmented
                    aria-label={t("walletForm.currency")}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={paid > 0}
                    options={[
                      { value: "USD", label: "$" },
                      { value: "KHR", label: "៛" },
                    ]}
                  />
                )}
              />
            </div>
          </div>
          {err("total")}
          {paid > 0 && <p className="text-xs text-muted-foreground">{t("debtForm.currencyLocked")}</p>}
        </div>

        <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("debt.qardHasan")}</span>
            <span className="block text-xs text-muted-foreground">{t("debt.qardHasanHint")}</span>
          </span>
          <Controller
            control={control}
            name="qardHasan"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(on) => {
                  field.onChange(on)
                  if (on) setValue("interest", "")
                }}
                aria-label={t("debt.qardHasan")}
              />
            )}
          />
        </label>

        <div className={cn("space-y-2", qardHasan && "hidden")}>
          <Label htmlFor="debt-interest">{t("debtForm.interest")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="debt-interest"
              className="h-11 flex-1 tabular-nums"
              inputMode="decimal"
              placeholder="0"
              {...register("interest")}
            />
            <div className="w-40">
              <Controller
                control={control}
                name="interestPeriod"
                render={({ field }) => (
                  <Segmented
                    aria-label={t("debtForm.interest")}
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: "YEAR", label: t("debtForm.perYear") },
                      { value: "MONTH", label: t("debtForm.perMonth") },
                    ]}
                  />
                )}
              />
            </div>
          </div>
          {err("interest")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="debt-start">{t("debtForm.startDate")}</Label>
            <Input id="debt-start" type="date" className="h-11" max="9999-12-31" {...register("startDate")} />
          </div>
          <div className={cn("space-y-2", schedOn && "hidden")}>
            <Label htmlFor="debt-due">{t("debtForm.dueDate")}</Label>
            <Input id="debt-due" type="date" className="h-11" max="9999-12-31" {...register("dueDate")} />
          </div>
        </div>
        {err("dueDate")}

        {/* Installment schedule (PRO): monthly / weekly payments with the interest split out. */}
        <div className={cn("space-y-3 rounded-xl border p-3", schedOn && "border-primary/30 bg-primary/5")}>
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {t("schedule.title")}
                {!isPro && <CrownIcon className="size-3.5 text-amber-500" aria-label="PRO" />}
              </span>
              <span className="block text-xs text-muted-foreground">{t("schedule.hint")}</span>
            </span>
            <Controller
              control={control}
              name="schedOn"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(on) => {
                    if (on && !isPro && !debt?.schedule_frequency) return showUpgrade("general")
                    field.onChange(on)
                  }}
                  aria-label={t("schedule.title")}
                />
              )}
            />
          </label>
          {schedOn && (
            <>
              {!qardHasan && (
                <Controller
                  control={control}
                  name="schedMethod"
                  render={({ field }) => (
                    <Segmented
                      aria-label={t("schedule.method")}
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "BANK", label: t("bankLoan.method") },
                        { value: "REDUCING", label: t("loan.reducing") },
                        { value: "FLAT", label: t("loan.flat") },
                      ]}
                    />
                  )}
                />
              )}
              {bank ? (
                <p className="text-xs text-muted-foreground">{t("bankLoan.hint")}</p>
              ) : (
                <Controller
                  control={control}
                  name="schedFrequency"
                  render={({ field }) => (
                    <Segmented
                      aria-label={t("schedule.frequency")}
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "MONTHLY", label: t("schedule.MONTHLY") },
                        { value: "WEEKLY", label: t("schedule.WEEKLY") },
                      ]}
                    />
                  )}
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sched-count">{t(schedFrequency === "WEEKLY" ? "schedule.countWeeks" : "schedule.countMonths")}</Label>
                  <Input id="sched-count" className="h-11 bg-background tabular-nums" inputMode="numeric" maxLength={3} {...register("schedCount")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sched-first">{t("schedule.firstDue")}</Label>
                  <Input id="sched-first" type="date" className="h-11 bg-background" max="9999-12-31" {...register("schedFirst")} />
                </div>
              </div>
              {bank && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched-fee">{t("bankLoan.fee")}</Label>
                  <Input id="sched-fee" className="h-11 bg-background tabular-nums" inputMode="decimal" placeholder="2.50" {...register("schedFee")} />
                  {err("schedFee")}
                </div>
              )}
              {schedulePreview ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-background p-3 text-sm">
                  {bank && schedulePreview.rows[0] && (
                    <>
                      <dt className="text-muted-foreground">{t("bankLoan.first")}</dt>
                      <dd className="text-right font-semibold tabular-nums">{formatMoney(schedulePreview.rows[0].payment, currency)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t(bank ? "bankLoan.regular" : schedFrequency === "WEEKLY" ? "schedule.perWeek" : "schedule.perMonth")}</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(schedulePreview.monthlyPayment, currency)}</dd>
                  <dt className="text-muted-foreground">{t("schedule.totalInterest")}</dt>
                  <dd className="text-right tabular-nums">{formatMoney(schedulePreview.totalInterest, currency)}</dd>
                  {bank && schedulePreview.totalFees > 0 && (
                    <>
                      <dt className="text-muted-foreground">{t("bankLoan.totalFees")}</dt>
                      <dd className="text-right tabular-nums">{formatMoney(schedulePreview.totalFees, currency)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t("schedule.totalToRepay")}</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(schedulePreview.totalPayment, currency)}</dd>
                  <dt className="text-muted-foreground">{t("schedule.lastPayment")}</dt>
                  <dd className="text-right tabular-nums">{schedulePreview.lastPaymentDate.split("-").reverse().join("/")}</dd>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">{t("schedule.invalid")}</p>
              )}
            </>
          )}
        </div>

        {!debt && (
          <div className="space-y-3 rounded-xl border p-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                {...register("moveMoney", {
                  onChange: (e) => {
                    if (e.target.checked && !walletId) {
                      const preferred = activeWallets.find((w) => w.currency === currency) ?? activeWallets[0]
                      if (preferred) setValue("walletId", preferred.id)
                    }
                  },
                })}
              />
              <span>
                <span className="block font-medium">
                  {t(`debtForm.moveMoney${selectedType}`)}
                  {disbursementAmount !== undefined && ` (${formatMoney(disbursementAmount, currency)})`}
                </span>
                <span className="block text-xs text-muted-foreground">{t("debtForm.moveMoneyHint")}</span>
              </span>
            </label>
            {moveMoney && (
              <div className="space-y-2">
                {activeWallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("entry.noWallet")}</p>
                ) : (
                  <Controller
                    control={control}
                    name="walletId"
                    render={({ field }) => (
                      <WalletSelect
                        wallets={activeWallets}
                        value={field.value}
                        onChange={field.onChange}
                        label={t(`debtForm.moveMoney${selectedType}`)}
                      />
                    )}
                  />
                )}
                {err("walletId")}
                {moneyConverted !== null && moneyWallet && (
                  <p className="text-xs text-muted-foreground">
                    {t("entry.converted", {
                      amount: formatMoney(moneyConverted, moneyWallet.currency),
                      rate: khrPerUsd.toLocaleString("en-US"),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {selectedType === "PAYABLE" && (
          <div className="space-y-3 rounded-xl border p-3">
            <Controller
              control={control}
              name="insured"
              render={({ field }) => (
                <label className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheckIcon className="size-4 text-sky-600" aria-hidden />
                    {t("insurance.toggle")}
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
            {insured && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ins-insurer">{t("insurance.insurer")}</Label>
                  <Input id="ins-insurer" className="h-11" maxLength={60} list="insurers" placeholder="Forte, Manulife, AIA…" {...register("insurer")} />
                  <datalist id="insurers">
                    {INSURERS.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ins-policy">{t("insurance.policyNo")}</Label>
                  <Input id="ins-policy" className="h-11" maxLength={60} autoComplete="off" {...register("policyNo")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ins-premium">{t("insurance.premium")}</Label>
                  <div className="flex gap-2">
                    <Input id="ins-premium" className="h-11 min-w-0 flex-1 tabular-nums" inputMode="decimal" placeholder="0" autoComplete="off" {...register("premium")} />
                    <div className="w-28 shrink-0">
                      <Controller
                        control={control}
                        name="premiumCurrency"
                        render={({ field }) => (
                          <Segmented
                            aria-label={t("walletForm.currency")}
                            value={field.value}
                            onChange={field.onChange}
                            options={[
                              { value: "USD", label: "$" },
                              { value: "KHR", label: "៛" },
                            ]}
                          />
                        )}
                      />
                    </div>
                  </div>
                  {err("premium")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ins-renewal">{t("insurance.renewal")}</Label>
                  <Input id="ins-renewal" type="date" max="9999-12-31" className="h-11" {...register("renewal")} />
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="debt-note">{t("debtForm.note")}</Label>
          <Input id="debt-note" className="h-11" maxLength={500} placeholder={t("debtForm.notePlaceholder")} {...register("note")} />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </form>
    </BottomSheet>
  )
}
