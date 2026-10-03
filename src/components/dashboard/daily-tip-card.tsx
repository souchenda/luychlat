"use client"

import { ChevronRightIcon, LightbulbIcon, RefreshCwIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { cardSummary } from "@/lib/credit-card"
import { todayDate } from "@/lib/debts"
import type { Debt, Wallet, Workspace } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { tipOfTheDay, TOPIC_META } from "@/lib/tips"
import { useLocaleStore } from "@/stores/locale-store"

const DISMISS_KEY = "luychlat-tip-dismissed"

/**
 * Home: "💡 គន្លឹះឆ្លាតវៃថ្ងៃនេះ" — one 30-second tip a day, chosen for the
 * user's situation (debts, a high credit-card balance, a business). "Another
 * tip" shows the next one; ✕ hides the card until tomorrow (this device).
 */
export function DailyTipCard({ wallets, debts, workspace }: { wallets?: Wallet[]; debts?: Debt[]; workspace?: Workspace }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const islamic = useIslamicEnabled()
  const [offset, setOffset] = useState(0)
  const [hidden, setHidden] = useState(true)
  const today = todayDate()

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISS_KEY) === today)
    } catch {
      setHidden(false)
    }
  }, [today])

  const tip = useMemo(() => {
    const hasDebts = (debts ?? []).some((d) => d.type === "PAYABLE" && d.status !== "SETTLED")
    const highCardUse = (wallets ?? []).some((w) => cardSummary(w, today)?.high)
    return tipOfTheDay(new Date(), { islamic, hasDebts, highCardUse, business: workspace?.type === "BUSINESS" }, offset)
  }, [debts, wallets, today, islamic, workspace?.type, offset])

  if (hidden) return null
  const topic = TOPIC_META[tip.topic]

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3.5" aria-label={t("tips.today")}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <LightbulbIcon className="size-4" aria-hidden />
        </span>
        <p className="flex-1 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">{t("tips.today")}</p>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label={t("tips.hide")}
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(DISMISS_KEY, today)
            } catch {}
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div key={tip.id} className="mt-2 animate-in fade-in-0 duration-300">
        <p className="text-sm font-semibold">
          <span aria-hidden>{topic.emoji}</span> {tip.title[locale]}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tip.body[locale]}</p>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setOffset((n) => n + 1)}>
          <RefreshCwIcon className="size-3.5" aria-hidden />
          {t("tips.another")}
        </button>
        <Link href="/learn" className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400">
          {t("tips.all")}
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
