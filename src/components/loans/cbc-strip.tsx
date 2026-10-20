"use client"

import { Card } from "@/components/ui/card"
import { CbcCodeGuide, TIER_TONE } from "@/components/loans/cbc-code-guide"
import type { Debt } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import { useLoanInstallments } from "@/lib/loans/bank-loan"
import { CBC_ESTIMATE_NOTE, cbcHealth, cbcStrip } from "@/lib/loans/cbc"
import { debtSchedule, installments, isBankLoan } from "@/lib/loans/installments"
import { cn } from "@/lib/utils"

/**
 * The loan's last 24 cycles as CBC codes (founder, 20/10/2026) — from the installments' due dates and the payment dates
 * recorded with the 1-tap «បង់» — and the credit-health line. An estimate, labelled as such (lib/loans/cbc.ts).
 */
export function CbcStrip({ debt }: { debt: Debt }) {
  const bank = isBankLoan(debt)
  const schedule = debtSchedule(debt)
  const paidRows = useLoanInstallments(debt.id, Boolean(schedule)).data
  if (!schedule) return null
  const today = todayDate()
  const rows = installments(schedule, debt.paid_amount, today, debt.currency, bank).map((i) => ({ n: i.n, date: i.date, paid: i.status === "PAID" }))
  const cells = cbcStrip(rows, new Map((paidRows ?? []).map((r) => [r.n, r.paid_at])), today)
  if (!cells.length) return null
  const health = cbcHealth(cells)

  return (
    <Card className="gap-2.5 px-4 py-3" data-testid="cbc-strip">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">ប្រវត្តិសងប្រាក់ ២៤ ខែ (CBC)</h2>
        <CbcCodeGuide className="-mr-2" />
      </div>
      <div className="grid grid-cols-12 gap-1" role="list" aria-label="ប្រវត្តិសងប្រាក់ ២៤ ខែ">
        {Array.from({ length: 24 - cells.length }, (_, i) => (
          <span key={`empty-${i}`} className="aspect-square rounded-md border border-dashed border-muted" aria-hidden />
        ))}
        {cells.map((c) => (
          <span key={c.n} role="listitem" title={`លើកទី ${c.n} · ${c.due}`} className={cn("grid aspect-square place-items-center rounded-md font-mono text-[11px] font-semibold", TIER_TONE[c.tier])}>
            {c.code}
          </span>
        ))}
      </div>
      <p className="text-sm font-medium">{health.km}</p>
      <p className="text-[11px] text-muted-foreground">{CBC_ESTIMATE_NOTE} «✓» = បានបង់ តែមិនមានថ្ងៃបង់កត់ត្រា។</p>
    </Card>
  )
}
