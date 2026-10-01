"use client"

import { format } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { ChartColumnIcon, FilterXIcon, MinusIcon, PlusIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Amount } from "@/components/money/amount"
import { BulkDeleteSheet } from "@/components/transactions/bulk-delete-sheet"
import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cashFlow } from "@/lib/analytics"
import { adjustmentCategoryIds, categoryLabel } from "@/lib/categories/presets"
import { canWrite, useActiveWorkspace, useCategories, useTransactions, useWallets } from "@/lib/data/hooks"
import type { CategoryType, Transaction, TransactionFilter, TransactionType } from "@/lib/data/types"
import { monthKey, monthRange, monthStart, recentMonths } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const ALL = "all"
const MONTH_OPTIONS = 24

export default function TransactionsPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const ws = workspace?.id
  const wallets = useWallets(ws).data ?? []
  const categoriesData = useCategories(ws).data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])

  const [month, setMonth] = useState(monthKey())
  const [type, setType] = useState<TransactionType | typeof ALL>(ALL)
  const [walletId, setWalletId] = useState(ALL)
  const [categoryId, setCategoryId] = useState(ALL)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [entryType, setEntryType] = useState<CategoryType | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const filter = useMemo<TransactionFilter>(
    () => ({
      ...monthRange(month),
      ...(type !== ALL && { type }),
      ...(walletId !== ALL && { walletId }),
      ...(categoryId !== ALL && { categoryId }),
    }),
    [month, type, walletId, categoryId],
  )
  const txQuery = useTransactions(ws, filter)
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data])
  const flow = useMemo(
    () => cashFlow(transactions, khrPerUsd, adjustmentCategoryIds(categories)),
    [transactions, khrPerUsd, categories],
  )

  const months = useMemo(() => recentMonths(MONTH_OPTIONS).reverse(), [])
  const dateLocale = locale === "km" ? km : enUS
  // Category filter only makes sense for income/expense.
  const filterableCategories = categories.filter((c) => type === ALL || c.type === type)
  const filtersActive = type !== ALL || walletId !== ALL || categoryId !== ALL

  const clearFilters = () => {
    setType(ALL)
    setWalletId(ALL)
    setCategoryId(ALL)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t("ledger.title")}</h1>
        <div className="flex gap-1.5">
          {/* Bulk delete is for the workspace owner only (it can wipe a shared ledger). */}
          {workspace?.role === "OWNER" && (
            <Button size="icon" variant="outline" onClick={() => setBulkOpen(true)} aria-label={t("bulk.title")}>
              <Trash2Icon />
            </Button>
          )}
          <Button asChild size="icon" variant="outline" aria-label={t("reports.title")}>
            <Link href="/reports">
              <ChartColumnIcon />
            </Link>
          </Button>
          {editable && (
            <>
              <Button size="icon" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setEntryType("INCOME")} aria-label={t("entry.newINCOME")}>
                <PlusIcon />
              </Button>
              <Button size="icon" className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => setEntryType("EXPENSE")} aria-label={t("entry.newEXPENSE")}>
                <MinusIcon />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters: one block above the results. */}
      <div className="space-y-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full" aria-label={t("entry.date")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {format(monthStart(m), "MMMM yyyy", { locale: dateLocale })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Segmented
          aria-label={t("entry.category")}
          value={type}
          onChange={(v) => {
            setType(v)
            setCategoryId(ALL)
          }}
          options={[
            { value: ALL, label: t("common.all") },
            { value: "INCOME", label: t("tx.INCOME") },
            { value: "EXPENSE", label: t("tx.EXPENSE") },
            { value: "TRANSFER", label: t("tx.TRANSFER") },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="w-full" aria-label={t("entry.wallet")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("ledger.allWallets")}</SelectItem>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId} disabled={type === "TRANSFER"}>
            <SelectTrigger className="w-full" aria-label={t("entry.category")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("ledger.allCategories")}</SelectItem>
              {filterableCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {categoryLabel(c, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">{t("ledger.count", { count: transactions.length })}</span>
        <span className="flex gap-3 font-medium">
          <Amount value={flow.income.usd} currency="USD" signed className="text-emerald-600 dark:text-emerald-400" />
          <Amount value={-flow.expense.usd} currency="USD" signed />
        </span>
      </div>

      {txQuery.isLoading ? (
        <Skeleton className="h-60 w-full rounded-xl" />
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <SearchXIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("ledger.empty")}</p>
          {filtersActive && (
            <Button size="sm" variant="outline" onClick={clearFilters}>
              <FilterXIcon />
              {t("ledger.clearFilters")}
            </Button>
          )}
        </div>
      ) : (
        <TransactionList
          transactions={transactions}
          wallets={wallets}
          categories={categories}
          onSelect={setEditing}
          groupByDay
        />
      )}

      <EntryFormSheet
        open={entryType !== null}
        onOpenChange={(open) => !open && setEntryType(null)}
        workspaceId={ws}
        wallets={wallets}
        type={entryType ?? "EXPENSE"}
      />
      <BulkDeleteSheet open={bulkOpen} onOpenChange={setBulkOpen} workspaceId={ws} />
      <TransactionEditor workspaceId={ws} wallets={wallets} transaction={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
