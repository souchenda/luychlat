"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BellIcon, ChevronRightIcon, MoonIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useTelegramLink } from "@/components/settings/official-bot"
import { Switch } from "@/components/ui/switch"
import { formatDuration } from "@/lib/format"
import { khmerDigits } from "@/lib/dates"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatChhankitek, formatLunar, nextHolyDay } from "@/lib/khmer-lunar"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLocaleStore } from "@/stores/locale-store"

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "១១ តុលា" / "11 October" / "10月11日" — written out, since phones often lack Khmer date formatting. */
function shortDate(iso: string, locale: string) {
  const [, m, d] = iso.split("-").map(Number)
  if (locale === "km") return khmerDigits(`${d} ${KM_MONTHS[m - 1]}`)
  if (locale === "zh") return `${m}月${d}日`
  return `${d} ${EN_MONTHS[m - 1]}`
}

/**
 * On Home and at the top of Bills: today's full Chhankitek date, the next
 * ថ្ងៃសីល (big / small, with its festival) and how far away it is, and the
 * Telegram reminder on the eve (ថ្ងៃកោរ) — the same switch as Settings ›
 * Telegram. Shown to everyone, Islamic Mode included.
 */
export function HolyDayCard() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const link = useTelegramLink().data
  const queryClient = useQueryClient()
  // The date comes from this device after mounting (no server/client mismatch around midnight).
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayDate()), [])

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await getSupabaseBrowserClient()!.from("telegram_links").update({ holy_day_alerts: on }).not("chat_id", "is", null)
      if (error) throw error
    },
    onSuccess: (_, on) => {
      toast.success(t(on ? "holyDay.reminderOn" : "holyDay.reminderOff"))
      void queryClient.invalidateQueries({ queryKey: ["telegram-link"] })
    },
    onError: () => toast.error(t("common.error")),
  })

  // Only waits for the device's date (one render after mounting).
  if (!today) return null
  const next = nextHolyDay(today)

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-linear-to-br from-amber-50 via-orange-50/70 to-yellow-50 p-4 shadow-sm dark:border-amber-900/50 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-yellow-500/10">
      <MoonIcon aria-hidden className="pointer-events-none absolute -top-4 -right-4 size-28 -rotate-12 text-amber-400/15" />

      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30">
          <MoonIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-800/80 dark:text-amber-300/80">{t("holyDay.title")}</p>
          <p className="mt-0.5 text-[15px] leading-relaxed font-semibold text-amber-950 dark:text-amber-100">{formatChhankitek(today, locale)}</p>
        </div>
      </div>

      {next && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-white/70 p-3 dark:bg-black/20">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              {next.daysAway === 0 ? t("holyDay.today") : t("holyDay.next")}{" "}
              {t(next.kind === "big" ? "holyDay.big" : "holyDay.small")}
              {next.festival && ` (${t(`holyDay.festival.${next.festival}` as MessageKey)} · ${formatLunar(next.lunar, locale)})`}
              {!next.festival && ` (${formatLunar(next.lunar, locale)})`}
            </p>
            {next.daysAway > 0 && (
              <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                {formatDuration(next.daysAway, "remaining", locale, today)} · {shortDate(next.iso, locale)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Reminder on the eve (ថ្ងៃកោរ), 18:00, in Telegram. */}
      {link ? (
        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <BellIcon className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <span className="flex-1 text-neutral-800 dark:text-neutral-200">{t("holyDay.remind")}</span>
          <Switch checked={Boolean(link.holy_day_alerts)} disabled={toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} aria-label={t("holyDay.remind")} />
        </label>
      ) : (
        <Link href="/settings/telegram" className="mt-3 flex items-center gap-2.5 text-sm text-amber-800 hover:underline dark:text-amber-300">
          <BellIcon className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("holyDay.linkToRemind")}</span>
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  )
}
