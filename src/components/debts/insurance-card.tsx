"use client"

import { format, parseISO } from "date-fns"
import { ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { Amount } from "@/components/money/amount"
import type { Debt } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { renewalDays, upcomingRenewals } from "@/lib/insurance"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { useLocaleStore } from "@/stores/locale-store"

/** Small "🛡️ Insured" pill for debt lists. */
export function InsuredBadge({ debt, className }: { debt: Debt; className?: string }) {
  const t = useT()
  if (!debt.insured) return null
  const days = renewalDays(debt)
  const due = days !== null && days <= 30
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        due ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-sky-500/15 text-sky-700 dark:text-sky-400",
        className,
      )}
    >
      <ShieldCheckIcon className="size-3.5" aria-hidden />
      {t("insurance.badge")}
    </span>
  )
}

/** Policy details and the renewal countdown on the debt page. */
export function InsuranceCard({ debt }: { debt: Debt }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  if (!debt.insured) return null
  const days = renewalDays(debt)
  const tone =
    days === null ? "text-muted-foreground" : days < 0 ? "text-destructive" : days <= 30 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
  return (
    <div className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-700 dark:text-sky-400">
        <ShieldCheckIcon className="size-4" aria-hidden />
        {t("insurance.badge")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {debt.insurer && (
          <>
            <dt className="text-muted-foreground">{t("insurance.insurer")}</dt>
            <dd className="text-right font-medium">{debt.insurer}</dd>
          </>
        )}
        {debt.insurance_policy_no && (
          <>
            <dt className="text-muted-foreground">{t("insurance.policyNo")}</dt>
            <dd className="text-right font-mono text-xs leading-5">{debt.insurance_policy_no}</dd>
          </>
        )}
        {debt.insurance_premium != null && debt.insurance_currency && (
          <>
            <dt className="text-muted-foreground">{t("insurance.premium")}</dt>
            <dd className="text-right">
              <Amount value={debt.insurance_premium} currency={debt.insurance_currency} className="font-medium" />
            </dd>
          </>
        )}
        {debt.insurance_renewal_date && (
          <>
            <dt className="text-muted-foreground">{t("insurance.renewal")}</dt>
            <dd className="text-right">{format(parseISO(debt.insurance_renewal_date), "dd/MM/yyyy")}</dd>
          </>
        )}
      </dl>
      {days !== null && (
        <p className={cn("text-xs font-medium", tone)}>
          {days < 0 ? t("insurance.overdue", { duration: formatDuration(-days, "overdue", locale) }) : days === 0 ? t("insurance.today") : t("insurance.inDays", { duration: formatDuration(days, "remaining", locale) })}
        </p>
      )}
    </div>
  )
}

/** Home: loan insurance renewals due within 30 days or overdue (nothing when there are none). */
export function InsuranceRenewalCard({ debts }: { debts: Debt[] | undefined }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const due = upcomingRenewals(debts ?? [])
  if (!due.length) return null
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <ShieldCheckIcon className="size-4" aria-hidden />
        {t("insurance.renewalsTitle")}
      </h2>
      <ul className="space-y-2">
        {due.map(({ debt, days }) => (
          <li key={debt.id}>
            <Link
              href={`/debts/${debt.id}`}
              className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 transition-colors hover:bg-amber-500/15"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{debt.insurer || debt.party_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {debt.party_name}
                  {debt.insurance_premium != null && debt.insurance_currency ? ` · ${formatMoney(debt.insurance_premium, debt.insurance_currency)}` : ""}
                </span>
              </span>
              <span className={cn("shrink-0 text-xs font-semibold", days < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                {days < 0 ? t("insurance.overdue", { duration: formatDuration(-days, "overdue", locale) }) : days === 0 ? t("insurance.today") : t("insurance.inDays", { duration: formatDuration(days, "remaining", locale) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
