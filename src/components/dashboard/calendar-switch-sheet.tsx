"use client"

import { ChevronRightIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { todayDate } from "@/lib/debts"
import { latinDigits } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatHijri, toHijri } from "@/lib/islamic"
import { useIslamicDefaults, useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { khmerLunarDate } from "@/lib/khmer-lunar"
import { useLocaleStore } from "@/stores/locale-store"

type Calendar = "lunar" | "hijri"

/**
 * Home header: tapping the date badge switches the calendar at once (founder, 18/10/2026) — the Khmer lunar
 * calendar with «ថ្ងៃសីល», or the Hijri calendar. The calendar follows Islamic Mode, so this switch IS the
 * Islamic Mode switch (as in Settings › Preferences), and says so.
 */
export function CalendarSwitchSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { settings } = useIslamicSettings()
  const { setEnabled } = useIslamicMutations()
  const offset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const value: Calendar = settings.enabled ? "hijri" : "lunar"

  const today = todayDate()
  const l = khmerLunarDate(today)
  const lunar = locale === "km" ? `${l.day} ${l.phase === "kert" ? "កើត" : "រោច"}` : `${l.day} ${l.phase === "kert" ? "waxing" : "waning"}`
  const h = toHijri(new Date(), offset)
  const hijri = h ? latinDigits(formatHijri(h, locale === "km" ? "km" : "en", { short: true })) : "—"

  const choose = (next: Calendar) => {
    if (next === value || setEnabled.isPending) return
    const on = next === "hijri"
    setEnabled.mutate(on, {
      onSuccess: () => {
        toast.success(t(on ? "calendar.switchedHijri" : "calendar.switchedLunar"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("calendar.title")}>
      <div className="space-y-4">
        <Segmented
          aria-label={t("calendar.title")}
          value={value}
          onChange={choose}
          disabled={setEnabled.isPending}
          options={[
            { value: "lunar", label: t("calendar.lunar") },
            { value: "hijri", label: t("calendar.hijri") },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <p className={`rounded-xl border px-2 py-3 ${value === "lunar" ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10" : ""}`}>
            <span className="block text-xs text-muted-foreground">{t("calendar.today")}</span>
            <span className="font-medium">{lunar} · {t("holyDay.pill")}</span>
          </p>
          <p className={`rounded-xl border px-2 py-3 ${value === "hijri" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10" : ""}`}>
            <span className="block text-xs text-muted-foreground">{t("calendar.today")}</span>
            <span className="font-medium">🌙 {hijri}</span>
          </p>
        </div>
        {setEnabled.isPending && <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("calendar.modeNote")}</p>
        <Link
          href={value === "hijri" ? "/islamic/prayer" : "/bills"}
          onClick={() => onOpenChange(false)}
          className="flex min-h-11 items-center justify-between rounded-xl border px-4 text-sm font-medium hover:bg-muted"
        >
          {t(value === "hijri" ? "calendar.openIslamic" : "calendar.openHolyDays")}
          <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </BottomSheet>
  )
}
