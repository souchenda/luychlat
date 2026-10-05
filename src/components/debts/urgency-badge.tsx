"use client"

import { formatOverdue, formatRemaining } from "@/lib/format"
import { AlarmClockIcon, CalendarClockIcon, CalendarIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react"

import type { Debt } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { daysLeft, dueOf, todayDate, urgency, type Urgency } from "@/lib/debts"
import { nextScheduledDue } from "@/lib/loans/installments"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { cn } from "@/lib/utils"

// Status colours always ship with an icon and a text label, never colour alone.
const STYLE: Record<Urgency, { className: string; icon: typeof CalendarIcon }> = {
  safe: { className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", icon: CalendarClockIcon },
  soon: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: AlarmClockIcon },
  due: { className: "bg-red-500/12 text-red-700 dark:text-red-400", icon: TriangleAlertIcon },
  settled: { className: "bg-muted text-muted-foreground", icon: CircleCheckIcon },
  none: { className: "bg-muted text-muted-foreground", icon: CalendarIcon },
}

/**
 * Green: more than 7 days · amber: 1–7 days · red: due today or overdue.
 * Time is said in days, then months and days, then years and months; a loan
 * with an installment schedule shows its next installment ("លើកទី ៣ · …").
 */
export function UrgencyBadge({ debt, className }: { debt: Debt; className?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const today = todayDate()
  const level = urgency(debt, today)
  const due = dueOf(debt, today)
  const days = daysLeft({ due_date: due }, today) ?? 0
  const installment = level === "settled" ? null : nextScheduledDue(debt, today)
  const text =
    level === "settled"
      ? t("urgency.settled")
      : level === "none"
        ? t("urgency.none")
        : level === "safe"
          ? formatRemaining(t, due, locale, today) || t("urgency.safe", { days })
          : level === "soon"
            ? t("urgency.soon", { days })
            : days === 0
              ? t("urgency.today")
              : formatOverdue(t, due, locale, today) || t("urgency.today")
  const label = (locale === "km" ? khmerDigits : String)(installment ? `${t("urgency.installment", { n: installment.n })} · ${text}` : text)
  const { className: tone, icon: Icon } = STYLE[level]

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}
