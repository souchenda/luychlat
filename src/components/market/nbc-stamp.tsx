"use client"

import { format } from "date-fns"
import { ClockIcon, InfoIcon } from "lucide-react"

import { dayDate } from "@/lib/dates"
import type { Locale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import type { NbcRates } from "@/lib/market-calc"

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
/** A "YYYY-MM-DD" day as a local date (noon, so no time zone shifts the day). */
const day = (iso: string) => new Date(`${iso}T12:00:00`)

/** "05/10" — the "As of" day, short (Khmer digits in Khmer). */
export function nbcShortDate(nbc: Pick<NbcRates, "date">, locale: Locale) {
  const s = format(day(nbc.date), "dd/MM")
  return locale === "km" ? kmDigits(s) : s
}

/**
 * Like ABA / ACLEDA: the official "As of" day and when we last updated it, so
 * a weekend rate is never a bare number — on one line; a tap shows why the day
 * can be ahead (NBC publishes the next working day's rate at ~16:30).
 */
export function NbcStamp({ nbc, fetchedAt, locale }: { nbc: NbcRates; fetchedAt?: string; locale: Locale }) {
  const t = useT()
  const updatedIso = nbc.fetched_at ?? fetchedAt
  const updated = updatedIso ? format(new Date(updatedIso), "HH:mm · dd/MM") : null
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span className="truncate font-medium text-foreground">{t("market.asOf", { date: nbcShortDate(nbc, locale) })}</span>
        {updated && (
          <span className="flex shrink-0 items-center gap-1 [&_svg]:size-3">
            · <ClockIcon aria-hidden />
            {locale === "km" ? kmDigits(updated) : updated}
          </span>
        )}
        {nbc.source === "manual" && <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">{t("market.rateManual")}</span>}
        <InfoIcon className="ml-auto size-3.5 shrink-0 group-open:text-primary" aria-hidden />
      </summary>
      <div className="mt-1.5 space-y-0.5 leading-relaxed">
        {nbc.source === "manual" && nbc.others_date && <p>{t("market.othersAsOf", { date: dayDate(day(nbc.others_date), locale) })}</p>}
        <p>{t("market.nbcSchedule")}</p>
      </div>
    </details>
  )
}
