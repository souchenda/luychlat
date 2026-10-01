"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebtMutations } from "@/lib/data/hooks"
import type { Debt, DebtInput, DebtType } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { formatNationalNumber, isValidNationalNumber, KH_COUNTRY_CODE, toE164, toNationalNumber } from "@/lib/phone"

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
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: z.string(),
      note: z.string().max(500),
    })
    .superRefine((v, ctx) => {
      const total = parseAmount(v.total)
      if (!(total > 0)) ctx.addIssue({ code: "custom", path: ["total"], message: "walletForm.amountInvalid" })
      else if (total < paid) ctx.addIssue({ code: "custom", path: ["total"], message: "debtForm.totalBelowPaid" })
      if (v.interest && !(parseAmount(v.interest) >= 0)) {
        ctx.addIssue({ code: "custom", path: ["interest"], message: "walletForm.amountInvalid" })
      }
      if (v.phone && !isValidNationalNumber(v.phone)) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "login.invalidPhone" })
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
}

export function DebtFormSheet({ open, onOpenChange, workspaceId, defaultType = "PAYABLE", debt, onSaved }: DebtFormSheetProps) {
  const t = useT()
  const mutations = useDebtMutations(workspaceId)
  const paid = debt?.paid_amount ?? 0
  const schema = useMemo(() => buildSchema(paid), [paid])

  const defaults = (): FormValues =>
    debt
      ? {
          type: debt.type,
          party: debt.party_name,
          phone: debt.contact_phone ? toNationalNumber(debt.contact_phone) : "",
          total: String(debt.total_amount),
          currency: debt.currency,
          interest: debt.interest_rate ? String(debt.interest_rate) : "",
          interestPeriod: debt.interest_period,
          startDate: debt.start_date,
          dueDate: debt.due_date ?? "",
          note: debt.note ?? "",
        }
      : {
          type: defaultType,
          party: "",
          phone: "",
          total: "",
          currency: "USD",
          interest: "",
          interestPeriod: "YEAR",
          startDate: todayDate(),
          dueDate: "",
          note: "",
        }

  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })

  const selectedType = useWatch({ control, name: "type" })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, debt?.id])

  const onSubmit = handleSubmit(async (v) => {
    const input: DebtInput = {
      type: v.type,
      party_name: v.party.trim(),
      contact_phone: v.phone ? toE164(v.phone) : null,
      total_amount: roundMoney(parseAmount(v.total), v.currency),
      currency: v.currency,
      interest_rate: v.interest ? parseAmount(v.interest) : 0,
      interest_period: v.interestPeriod,
      start_date: v.startDate,
      due_date: v.dueDate || null,
      note: v.note.trim() || null,
    }
    try {
      const saved = debt
        ? await mutations.update.mutateAsync({ id: debt.id, input })
        : await mutations.create.mutateAsync(input)
      toast.success(t("debtForm.saved"))
      onOpenChange(false)
      onSaved?.(saved)
    } catch {
      toast.error(t("common.error"))
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
                    { value: "PAYABLE", label: `📤 ${t("debts.PAYABLE")}` },
                    { value: "RECEIVABLE", label: `📥 ${t("debts.RECEIVABLE")}` },
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
          <Label htmlFor="debt-total">{t("debtForm.total")}</Label>
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

        <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="debt-due">{t("debtForm.dueDate")}</Label>
            <Input id="debt-due" type="date" className="h-11" max="9999-12-31" {...register("dueDate")} />
          </div>
        </div>
        {err("dueDate")}

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
