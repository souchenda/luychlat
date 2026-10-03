"use client"

import { format } from "date-fns"
import { ClockIcon } from "lucide-react"

import { dayDate, longDate } from "@/lib/dates"
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
 * a weekend rate is never a bare number. NBC publishes the next working day's
 * rate at ~16:30, so on a weekend the "As of" day is often Monday.
 */
export function NbcStamp({ nbc, fetchedAt, locale }: { nbc: NbcRates; fetchedAt?: string; locale: Locale }) {
  const t = useT()
  const updatedIso = nbc.fetched_at ?? fetchedAt
  const updated = updatedIso ? format(new Date(updatedIso), "HH:mm · dd/MM/yyyy") : null
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{t("market.asOf", { date: longDate(day(nbc.date), locale) })}</p>
      {updated && (
        <p className="flex items-center gap-1 [&_svg]:size-3">
          <ClockIcon aria-hidden />
          {t("market.rateUpdated", { time: locale === "km" ? kmDigits(updated) : updated })}
          {nbc.source === "manual" && ` · ${t("market.rateManual")}`}
        </p>
      )}
      {nbc.source === "manual" && nbc.others_date && <p>{t("market.othersAsOf", { date: dayDate(day(nbc.others_date), locale) })}</p>}
      <p>{t("market.nbcSchedule")}</p>
    </div>
  )
}
