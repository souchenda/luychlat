"use client"

import { AlarmClockIcon, CalendarClockIcon, CalendarIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react"

import type { Debt } from "@/lib/data/types"
import { daysLeft, urgency, type Urgency } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

// Status colours always ship with an icon and a text label, never colour alone.
const STYLE: Record<Urgency, { className: string; icon: typeof CalendarIcon }> = {
  safe: { className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", icon: CalendarClockIcon },
  soon: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: AlarmClockIcon },
  due: { className: "bg-red-500/12 text-red-700 dark:text-red-400", icon: TriangleAlertIcon },
  settled: { className: "bg-muted text-muted-foreground", icon: CircleCheckIcon },
  none: { className: "bg-muted text-muted-foreground", icon: CalendarIcon },
}

/** 🟢 > 7 days · 🟠 1–7 days · 🔴 due today or overdue. */
export function UrgencyBadge({ debt, className }: { debt: Debt; className?: string }) {
  const t = useT()
  const level = urgency(debt)
  const days = daysLeft(debt) ?? 0
  const label =
    level === "settled"
      ? t("urgency.settled")
      : level === "none"
        ? t("urgency.none")
        : level === "safe"
          ? t("urgency.safe", { days })
          : level === "soon"
            ? t("urgency.soon", { days })
            : days === 0
              ? t("urgency.today")
              : t("urgency.overdue", { days: -days })
  const { className: tone, icon: Icon } = STYLE[level]

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}
