"use client"

import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  ChartCandlestickIcon,
  FileDownIcon,
  type LucideIcon,
  MoonStarIcon,
  PlusIcon,
  ScaleIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  TargetIcon,
} from "lucide-react"
import Link from "next/link"

import { useT } from "@/lib/i18n/use-t"
import type { QuickAction, QuickActionKey } from "@/lib/quick-actions"

const ICONS: Record<QuickActionKey, LucideIcon> = {
  scan: ScanLineIcon,
  entry: PlusIcon,
  transfer: ArrowLeftRightIcon,
  loans: ShieldCheckIcon,
  // A target for the goals: no pig imagery anywhere — Islamic Mode users see this grid (founder, 21/10/2026).
  goals: TargetIcon,
  bills: CalendarClockIcon,
  budgets: ScaleIcon,
  market: ChartCandlestickIcon,
  islamic: MoonStarIcon,
  export: FileDownIcon,
}

const TILE =
  "flex min-h-[5.5rem] flex-col items-center justify-start gap-1.5 rounded-2xl px-1 py-2.5 text-center transition-all hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"

/**
 * The quick actions (lib/quick-actions) as squircle tiles, three a row, in one framed card — each a large touch target
 * (≥ 88 px tall). A sibling below the hero card, never inside it (tests/golden/layout-guards.test.ts).
 */
export function QuickActionGrid({ actions, onEntry, onTransfer }: { actions: QuickAction[]; onEntry: () => void; onTransfer: () => void }) {
  const t = useT()
  return (
    <nav aria-label={t("quick.title")} className="grid grid-cols-3 gap-1 rounded-3xl border bg-card p-2 shadow-xs">
      {actions.map((a) => {
        const Icon = ICONS[a.key]
        const body = (
          <>
            <span className="grid size-12 place-items-center rounded-[1.1rem] bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-600/10 dark:bg-emerald-400/12 dark:text-emerald-300 dark:ring-emerald-300/15">
              <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
            </span>
            <span className="line-clamp-2 text-[13px] leading-tight font-medium">{t(a.label)}</span>
          </>
        )
        if (a.href && a.external) {
          return (
            <a key={a.key} href={a.href} target="_blank" rel="noopener noreferrer" className={TILE}>
              {body}
            </a>
          )
        }
        if (a.href) {
          return (
            <Link key={a.key} href={a.href} className={TILE}>
              {body}
            </Link>
          )
        }
        return (
          <button key={a.key} type="button" onClick={a.key === "transfer" ? onTransfer : onEntry} disabled={a.disabled} className={TILE}>
            {body}
          </button>
        )
      })}
    </nav>
  )
}
