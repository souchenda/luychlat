"use client"

import { CalendarClockIcon, ChevronRightIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { PartyAvatar } from "@/components/common/party-avatar"
import { Card } from "@/components/ui/card"
import { daysUntil, nextDue, useBills } from "@/lib/bills"
import { formatDuration, formatOverdue } from "@/lib/format"
import { useT } from "@/lib/i18n/use-t"
import { billCategory } from "@/lib/institution-logos"
import { KSCORE_TIERS, kscoreTier } from "@/lib/kscore"
import { useLatestKScore } from "@/lib/kscore-data"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Home «smart hub» (founder, 17/10/2026): the CBC K-Score as a compact badge (the person's own — the
 * Personal workspace only) and the NEXT obligation: the earliest active bill or loan installment that is
 * overdue or due within 7 days (nothing further — reminders are a week ahead at most). Each opens its page.
 * Hidden when there is neither.
 */
export function SmartHub({ workspaceId, personal }: { workspaceId: string | undefined; personal: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const kscore = useLatestKScore().data
  const next = (useBills(workspaceId).data ?? [])
    .filter((b) => b.is_active)
    .map((b) => ({ bill: b, due: nextDue(b), left: daysUntil(nextDue(b)) }))
    .filter((r) => r.left <= 7)
    .sort((a, b) => a.left - b.left)[0]
  const score = personal ? kscore : null
  if (!score && !next) return null
  const tier = score ? KSCORE_TIERS[kscoreTier(score.score)] : null

  return (
    <section className={cn("grid gap-2", score && next ? "grid-cols-[auto_1fr]" : "grid-cols-1")}>
      {score && tier && (
        <Link href="/debts?tab=PAYABLE#credit-health" aria-label={t("kscore.title")}>
          <Card className="h-full justify-center gap-0.5 px-3.5 py-3 transition-colors hover:bg-muted/40">
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
              K-Score
            </span>
            <span className="text-2xl leading-tight font-extrabold tabular-nums">{hidden ? "****" : score.score}</span>
            <span className="text-[13px] font-semibold" style={{ color: tier.to }}>
              {tier.dot} {tier.km}
            </span>
          </Card>
        </Link>
      )}
      {next && (
        <Link href="/bills" className="min-w-0">
          <Card className="h-full gap-1.5 px-3.5 py-3 transition-colors hover:bg-muted/40">
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <CalendarClockIcon className="size-4 text-amber-500" aria-hidden />
              {t("home.nextObligation")}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <PartyAvatar name={next.bill.title} category={billCategory(next.bill.kind)} className="size-8 shrink-0" />
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm leading-snug font-medium break-words">{next.bill.title}</span>
                <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] tabular-nums">
                  <span className="font-semibold">{formatMoney(next.bill.amount, next.bill.currency, { hidden })}</span>
                  <span className={cn(next.left < 0 ? "text-rose-600 dark:text-rose-400" : next.left <= 3 ? "text-amber-600" : "text-muted-foreground")}>
                    {next.left < 0 ? formatOverdue(next.due, locale) : next.left === 0 ? t("bills.dueToday") : t("bills.inDays", { duration: formatDuration(next.left, "remaining", locale) })}
                  </span>
                </span>
              </span>
              <ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </Card>
        </Link>
      )}
    </section>
  )
}
