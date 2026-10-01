"use client"

import { addMonths, format, parseISO, startOfMonth } from "date-fns"
import { ArrowLeftIcon, CalculatorIcon, FileSpreadsheetIcon, HandshakeIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveWorkspace } from "@/lib/data/hooks"
import type { Currency, DebtInput, InterestPeriod } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { computeSchedule, MAX_MONTHS, type LoanMethod } from "@/lib/loans/amortization"
import { formatMoney, parseAmount } from "@/lib/money"
import { exportAmortizationXlsx } from "@/lib/reports/export"
import { showUpgrade, useIsPro } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const fmtDate = (ymd: string) => format(parseISO(ymd), "dd/MM/yyyy")

/** ម៉ាស៊ីនគណនាតារាងរំលស់កម្ចី: flat vs reducing balance, full schedule, save as a payable. */
export default function LoanCalculatorPage() {
  const t = useT()
  const lang = useLocaleStore((s) => s.locale)
  const { workspace } = useActiveWorkspace()

  const [amountText, setAmountText] = useState("1000")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [rateText, setRateText] = useState("1.5")
  const [ratePeriod, setRatePeriod] = useState<InterestPeriod>("MONTH")
  const [tenureText, setTenureText] = useState("12")
  const [tenureUnit, setTenureUnit] = useState<"MONTHS" | "YEARS">("MONTHS")
  const [method, setMethod] = useState<LoanMethod>("FLAT")
  const [firstPayment, setFirstPayment] = useState(() => format(addMonths(startOfMonth(new Date()), 1), "yyyy-MM-dd"))
  const [saveOpen, setSaveOpen] = useState(false)

  const principal = parseAmount(amountText)
  const rate = parseAmount(rateText)
  const tenure = parseAmount(tenureText)
  const months = Math.round(tenureUnit === "YEARS" ? tenure * 12 : tenure)
  const errors = {
    amount: !(principal > 0),
    rate: !(rate >= 0) || rate > 100,
    tenure: !(months >= 1) || months > MAX_MONTHS,
  }
  const valid = !errors.amount && !errors.rate && !errors.tenure && Boolean(firstPayment)

  const schedule = useMemo(
    () =>
      valid ? computeSchedule({ principal, currency, rate, ratePeriod, months, method, firstPaymentDate: firstPayment }) : null,
    [valid, principal, currency, rate, ratePeriod, months, method, firstPayment],
  )
  // The other method, to show what the choice costs.
  const alternative = useMemo(
    () =>
      valid
        ? computeSchedule({ principal, currency, rate, ratePeriod, months, method: method === "FLAT" ? "REDUCING" : "FLAT", firstPaymentDate: firstPayment })
        : null,
    [valid, principal, currency, rate, ratePeriod, months, method, firstPayment],
  )

  const money = (n: number) => formatMoney(n, currency)
  const description = `${t(method === "FLAT" ? "loan.flat" : "loan.reducing")} · ${rate}${t(ratePeriod === "MONTH" ? "debtForm.perMonth" : "debtForm.perYear")} · ${months} ${t("loan.monthsShort")}`

  const prefill: Partial<DebtInput> | undefined = schedule
    ? {
        type: "PAYABLE",
        total_amount: schedule.totalPayment,
        currency,
        interest_rate: rate,
        interest_period: ratePeriod,
        start_date: format(new Date(), "yyyy-MM-dd"),
        due_date: schedule.lastPaymentDate,
        note: t("loan.note", {
          payment: money(schedule.monthlyPayment),
          months,
          first: fmtDate(firstPayment),
          principal: money(principal),
          method: t(method === "FLAT" ? "loan.flat" : "loan.reducing"),
        }).slice(0, 500),
      }
    : undefined

  const canExport = useIsPro("export")
  const exportSchedule = async () => {
    if (!schedule) return
    if (!canExport) return showUpgrade("export")
    try {
      await exportAmortizationXlsx({
        schedule,
        principal,
        currency,
        description,
        lang,
        fileName: `luysmart-loan-${method.toLowerCase()}-${months}m-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
      })
      toast.success(t("reports.exported"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 print:hidden">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/debts">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CalculatorIcon className="size-5 text-primary" aria-hidden />
          {t("loan.title")}
        </h1>
      </div>

      <Card className="gap-4 px-4 py-4 print:hidden">
        <div className="space-y-2">
          <Label htmlFor="loan-amount">{t("loan.amount")}</Label>
          <div className="flex gap-2">
            <Input id="loan-amount" className="h-12 flex-1 text-lg font-semibold tabular-nums" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-invalid={errors.amount} />
            <div className="w-28">
              <Segmented aria-label={t("walletForm.currency")} value={currency} onChange={setCurrency} options={[{ value: "USD", label: "$" }, { value: "KHR", label: "៛" }]} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loan-rate">{t("loan.rate")}</Label>
          <div className="flex gap-2">
            <Input id="loan-rate" className="h-11 flex-1 tabular-nums" inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} aria-invalid={errors.rate} />
            <div className="w-40">
              <Segmented aria-label={t("loan.rate")} value={ratePeriod} onChange={setRatePeriod} options={[{ value: "MONTH", label: t("debtForm.perMonth") }, { value: "YEAR", label: t("debtForm.perYear") }]} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loan-tenure">{t("loan.tenure")}</Label>
          <div className="flex gap-2">
            <Input id="loan-tenure" className="h-11 flex-1 tabular-nums" inputMode="numeric" value={tenureText} onChange={(e) => setTenureText(e.target.value)} aria-invalid={errors.tenure} />
            <div className="w-40">
              <Segmented aria-label={t("loan.tenure")} value={tenureUnit} onChange={setTenureUnit} options={[{ value: "MONTHS", label: t("loan.months") }, { value: "YEARS", label: t("loan.years") }]} />
            </div>
          </div>
          {errors.tenure && <p className="text-xs text-destructive">{t("loan.tenureInvalid", { max: MAX_MONTHS / 12 })}</p>}
        </div>

        <div className="space-y-2">
          <Label>{t("loan.method")}</Label>
          <Segmented aria-label={t("loan.method")} value={method} onChange={setMethod} options={[{ value: "FLAT", label: t("loan.flat") }, { value: "REDUCING", label: t("loan.reducing") }]} />
          <p className="text-xs text-muted-foreground">{t(method === "FLAT" ? "loan.flatHint" : "loan.reducingHint")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loan-first">{t("loan.firstPayment")}</Label>
          <Input id="loan-first" type="date" className="h-11" max="9999-12-31" value={firstPayment} onChange={(e) => e.target.value && setFirstPayment(e.target.value)} />
        </div>
      </Card>

      {schedule && alternative && (
        <>
          <Card className="gap-3 px-4 py-4">
            <p className="hidden text-xs text-muted-foreground print:block">លុយឆ្លាត · LuySmart — {description}</p>
            <div className="rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
              <p className="text-sm opacity-85">{t("loan.monthlyPayment")}</p>
              <p className="text-3xl font-bold tabular-nums">
                {money(schedule.monthlyPayment)}
                <span className="text-base font-medium opacity-85">/{t("loan.perMonthShort")}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">{t("loan.totalInterest")}</p>
                <p className="font-semibold tabular-nums">{money(schedule.totalInterest)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">{t("loan.totalPayment")}</p>
                <p className="font-semibold tabular-nums">{money(schedule.totalPayment)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("loan.compare", {
                method: t(method === "FLAT" ? "loan.reducing" : "loan.flat"),
                interest: money(alternative.totalInterest),
                payment: money(alternative.monthlyPayment),
              })}
            </p>
            <div className="grid grid-cols-2 gap-2 print:hidden">
              <Button className="h-11" onClick={() => setSaveOpen(true)}>
                <HandshakeIcon />
                {t("loan.save")}
              </Button>
              <Button variant="outline" className="h-11" onClick={exportSchedule}>
                <FileSpreadsheetIcon className="text-emerald-600" />
                Excel
              </Button>
            </div>
          </Card>

          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("loan.schedule")}</h2>
            <Card className="overflow-hidden py-0">
              <div className="max-h-[28rem] overflow-auto print:max-h-none">
                <table className="w-full text-xs tabular-nums">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">{t("loan.colMonth")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("loan.colPrincipal")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("loan.colInterest")}</th>
                      <th className="px-2 py-2 text-right font-medium">{t("loan.colBalance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schedule.rows.map((row) => (
                      <tr key={row.n} className={cn(row.n % 12 === 0 && "bg-muted/30")}>
                        <td className="px-2 py-1.5">
                          <span className="block font-medium">{t("loan.monthN", { n: row.n })}</span>
                          <span className="block text-[10px] text-muted-foreground">{fmtDate(row.date)} · {money(row.payment)}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">{money(row.principal)}</td>
                        <td className="px-2 py-1.5 text-right">{money(row.interest)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{money(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </>
      )}

      <DebtFormSheet
        open={saveOpen}
        onOpenChange={setSaveOpen}
        workspaceId={workspace?.id}
        defaultType="PAYABLE"
        prefill={prefill}
        disbursementAmount={valid ? principal : undefined}
        onSaved={() => toast.success(t("loan.saved"))}
      />
    </div>
  )
}
