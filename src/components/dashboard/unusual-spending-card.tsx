"use client"

import { LightbulbIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { cambodiaToday } from "@/lib/bills"
import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Transaction } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { unusualSpending } from "@/lib/unusual-spending"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const DISMISS_KEY = "luychlat:unusual-dismissed"

/**
 * «ចាយខុសធម្មតា» (founder, 9/11/2026 — lib/unusual-spending.ts): one gentle line when one kind of spending this month is
 * well above its usual — a fact and the usual beside it, never a scolding. Closed with ×, it stays closed for that
 * category this month (this phone). Personal and Family only.
 */
export function UnusualSpendingCard({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const month = cambodiaToday().slice(0, 7)
  const u = useMemo(() => unusualSpending(transactions, categories, khrPerUsd, month), [transactions, categories, khrPerUsd, month])
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY))
    } catch {
      setDismissed(null)
    }
  }, [])
  if (!u) return null
  const key = `${month}:${u.categoryId}`
  if (dismissed === key) return null
  const category = categories.find((c) => c.id === u.categoryId)
  if (!category) return null

  const close = () => {
    setDismissed(key)
    try {
      localStorage.setItem(DISMISS_KEY, key)
    } catch {
      // Storage blocked: closed for this visit only.
    }
  }

  return (
    <Card className="flex-row items-start gap-3 px-4 py-3">
      <LightbulbIcon className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
      <Link href="/reports" className="min-w-0 flex-1 text-sm leading-snug">
        <span className="block">
          {t("unusual.line", { category: categoryLabel(category, locale) })} <Amount value={u.thisMonth} currency="USD" className="font-semibold" />
        </span>
        <span className="block text-xs text-muted-foreground">
          {t("unusual.usual")} <Amount value={u.usual} currency="USD" />
        </span>
      </Link>
      <button type="button" onClick={close} aria-label={t("unusual.close")} className="-m-2 flex size-11 shrink-0 items-center justify-center text-muted-foreground">
        <XIcon className="size-4" />
      </button>
    </Card>
  )
}
