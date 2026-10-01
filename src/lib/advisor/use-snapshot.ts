"use client"

import { addMonths } from "date-fns"
import { useMemo } from "react"

import { categoryLabel } from "@/lib/categories/presets"
import { useActiveWorkspace, useCategories, useDebts, useTransactions, useWallets } from "@/lib/data/hooks"
import { monthKey, monthStart } from "@/lib/dates"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { computeSnapshot } from "./snapshot"

/** The active workspace's advisor snapshot (last 4 months of data), recomputed as data changes. */
export function useAdvisorSnapshot() {
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const filter = useMemo(() => ({ from: addMonths(monthStart(monthKey()), -3).toISOString() }), [])
  const wallets = useWallets(ws)
  const transactions = useTransactions(ws, filter)
  const categories = useCategories(ws)
  const debts = useDebts(ws)

  const loading = wallets.isLoading || transactions.isLoading || categories.isLoading || debts.isLoading
  const result = useMemo(() => {
    if (!workspace || !wallets.data || !transactions.data || !categories.data || !debts.data) return null
    return computeSnapshot({
      workspaceType: workspace.type,
      wallets: wallets.data,
      transactions: transactions.data,
      categories: categories.data,
      debts: debts.data,
      khrPerUsd,
      categoryLabel: (c) => categoryLabel(c, locale),
    })
  }, [workspace, wallets.data, transactions.data, categories.data, debts.data, khrPerUsd, locale])

  return { loading, snapshot: result?.snapshot ?? null, labels: result?.labels ?? null }
}
