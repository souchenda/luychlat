"use client"

import { CalendarRangeIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { PartyAvatar } from "@/components/common/party-avatar"
import { Card } from "@/components/ui/card"
import { cambodiaToday, useBills } from "@/lib/bills"
import { cashForecast } from "@/lib/cash-forecast"
import type { Transaction, Wallet } from "@/lib/data/types"
import { weekdayDate } from "@/lib/dates"
import { useFeatures } from "@/lib/features"
import { useT } from "@/lib/i18n/use-t"
import { billCategory } from "@/lib/institution-logos"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/** Payments listed on the card; the rest are on /bills. */
const SHOWN = 3

/**
 * 💡 The next 14 days (founder, 3/11/2026 — lib/cash-forecast.ts): the bills and loan instalments due, the first one the
 * money may not cover and by how much, the method in one line — an estimate, said so. A sibling below the hero; hidden
 * with nothing due in the 14 days. Feature flag cash_forecast (staff first).
 */
export function CashForecastCard({ workspaceId, wallets, transactions, business }: { workspaceId: string | undefined; wallets: Wallet[] | undefined; transactions: Transaction[]; business: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const allowed = useFeatures().allowed("cash_forecast")
  const bills = useBills(allowed ? workspaceId : undefined).data
  const f = useMemo(
    () => (allowed && wallets && bills ? cashForecast({ today: cambodiaToday(), wallets, bills, transactions, khrPerUsd }) : null),
    [allowed, wallets, bills, transactions, khrPerUsd],
  )
  // Shown whenever there is a wallet (founder, 3/11/2026: hidden with nothing due, it could not be found).
  if (!f) return null
  const end = f.days[f.days.length - 1]

  const money = (n: number) => formatMoney(n, f.currency, { hidden })
  const day = (iso: string) => weekdayDate(new Date(`${iso}T00:00:00`), locale)
  const income = t(business ? "forecast.sales" : "forecast.income")

  return (
    <Link href="/bills" aria-label={t("forecast.title")}>
      <Card className="gap-2.5 px-3.5 py-3 transition-colors hover:bg-muted/40">
        <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <CalendarRangeIcon className="size-4 text-primary" aria-hidden />
          {t("forecast.title")}
          <ChevronRightIcon className="ml-auto size-4 shrink-0" aria-hidden />
        </span>

        {f.short ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm leading-relaxed font-medium text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            {t("forecast.short", { day: day(f.short.payment.date), title: f.short.payment.title, amount: formatMoney(f.short.payment.amount, f.short.payment.currency, { hidden }), by: money(f.short.by) })}
          </p>
        ) : (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-relaxed font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            {f.payments.length === 0
              ? t("forecast.none", { amount: money(end.balance), day: day(end.date) })
              : t("forecast.enough", { lowest: money(f.lowest.balance), day: day(f.lowest.date) })}
          </p>
        )}

        <ul className="space-y-1.5">
          {f.payments.slice(0, SHOWN).map((p) => (
            <li key={`${p.title}-${p.date}`} className="flex min-w-0 items-center gap-2">
              <PartyAvatar name={p.title} category={billCategory(p.kind)} className="size-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.title}</span>
                <span className={cn("block text-xs", p.overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                  {p.overdue ? t("forecast.overdue") : day(p.date)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(p.amount, p.currency, { hidden })}</span>
            </li>
          ))}
        </ul>
        {f.payments.length > SHOWN && <span className="text-xs text-muted-foreground">{t("forecast.more", { count: f.payments.length - SHOWN })}</span>}

        {/* The method, always on screen (guardrail: no silent guessing). */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {f.averaged
            ? t("forecast.method", { income, in: money(f.dailyIn), out: money(f.dailyOut) })
            : t("forecast.methodShort")}
        </p>
      </Card>
    </Link>
  )
}
