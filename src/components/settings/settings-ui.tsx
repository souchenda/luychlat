"use client"

import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * Card-based settings building blocks: a muted uppercase header over a rounded
 * card of rows. Each row has a tinted icon tile, a title (and optional hint),
 * and on the right a value, badge, switch or chevron.
 */

export function SettingsGroup({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      {title && <h2 className="px-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h2>}
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">{children}</div>
    </section>
  )
}

/** Tile colors for row icons. */
export const TILE = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
} as const

type RowProps = {
  icon?: React.ReactNode
  tile?: keyof typeof TILE
  title: React.ReactNode
  hint?: React.ReactNode
  /** Right side: a value, badge or control. */
  children?: React.ReactNode
  /** Makes the whole row a link (with a chevron). */
  href?: string
  /** Makes the whole row a button (with a chevron unless `chevron={false}`). */
  onClick?: () => void
  chevron?: boolean
  className?: string
}

export function SettingsRow({ icon, tile = "slate", title, hint, children, href, onClick, chevron, className }: RowProps) {
  const interactive = Boolean(href || onClick)
  const body = (
    <>
      {icon && <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]", TILE[tile])}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
      {(chevron ?? interactive) && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
    </>
  )
  const base = cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left", className)
  const hover = "transition-colors hover:bg-muted/60 active:bg-muted"
  if (href) {
    return (
      <Link href={href} className={cn(base, hover)}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, hover)}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

const BADGE = {
  muted: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pro: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
} as const

export function StatusBadge({ tone = "muted", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3", BADGE[tone])}>{children}</span>
}

/** Sub-page header: back to Settings and a title. */
export function SettingsSubHeader({ title, back = "/settings" }: { title: string; back?: string }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2">
      <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
        <Link href={back}>
          <ArrowLeftIcon />
        </Link>
      </Button>
      <h1 className="flex-1 text-xl font-bold">{title}</h1>
    </div>
  )
}
