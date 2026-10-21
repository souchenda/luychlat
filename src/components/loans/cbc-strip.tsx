"use client"

import { Card } from "@/components/ui/card"
import { CbcHealthModal, CODE_TONE } from "@/components/loans/cbc-health-modal"
import type { Debt } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import { useLoanInstallments } from "@/lib/loans/bank-loan"
import { CBC_ESTIMATE_NOTE, cbcClosedOn, cbcHealth, cbcMonthStrip, cbcStrip } from "@/lib/loans/cbc"
import { debtSchedule, installments, isBankLoan } from "@/lib/loans/installments"
import { cn } from "@/lib/utils"

/**
 * The loan's last 24 months as CBC codes (founder, 20–21/10/2026) — from the installments' due dates and the payment
 * dates recorded with the 1-tap «បង់»: a calendar strip with each month's name («តុលា 26»), a colour per code, X before
 * the loan and C once it is paid off — and the credit-health line. An estimate, labelled as such (lib/loans/cbc.ts).
 */
export function CbcStrip({ debt }: { debt: Debt }) {
  const bank = isBankLoan(debt)
  const schedule = debtSchedule(debt)
  const paidRows = useLoanInstallments(debt.id, Boolean(schedule)).data
  if (!schedule) return null
  const today = todayDate()
  const rows = installments(schedule, debt.paid_amount, today, debt.currency, bank).map((i) => ({ n: i.n, date: i.date, paid: i.status === "PAID" }))
  const paidOn = new Map((paidRows ?? []).map((r) => [r.n, r.paid_at]))
  const cycles = cbcStrip(rows, paidOn, today)
  const months = cbcMonthStrip(rows, paidOn, today, debt.start_date, cbcClosedOn(rows, paidOn))
  const health = cbcHealth(cycles)

  return (
    <Card className="gap-2.5 px-4 py-3" data-testid="cbc-strip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">ប្រវត្តិសងប្រាក់ 24 ខែ (CBC)</h2>
        <CbcHealthModal />
      </div>
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-12" aria-label="ប្រវត្តិសងប្រាក់ 24 ខែ">
        {months.map((c) => (
          <li key={c.month} className="flex flex-col items-center gap-0.5" title={c.due ? `${c.label} · ថ្ងៃបង់ ${c.due}` : c.label}>
            <span className={cn("grid h-9 w-full place-items-center rounded-md font-mono text-xs font-semibold", CODE_TONE[c.code] ?? CODE_TONE["✓"])}>{c.code}</span>
            {/* «តុលា» over «26»: two short lines, never cut on a 360 px phone. */}
            <span className="text-center text-[10px] leading-tight text-muted-foreground">
              {c.label.split(" ")[0]}
              <br />
              {c.label.split(" ")[1]}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm font-medium">{health.km}</p>
      <p className="text-[11px] text-muted-foreground">{CBC_ESTIMATE_NOTE}</p>
    </Card>
  )
}
