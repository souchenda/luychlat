"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { CategoryIcon } from "@/components/categories/category-icon"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { categoryLabel } from "@/lib/categories/presets"
import { useBudgetMutations } from "@/lib/data/hooks"
import type { Budget, Category, Currency } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"

/** Set or change one category's monthly cap. */
export function BudgetSheet({
  open,
  onOpenChange,
  workspaceId,
  categories,
  budget,
  defaultCurrency,
  averages,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  /** Expense categories that can take a (new) budget. */
  categories: Category[]
  /** Edit this budget; create one when omitted. */
  budget?: Budget | null
  defaultCurrency: Currency
  /** Average monthly spending per category id (USD and KHR), shown as a hint. */
  averages: Map<string, { amount: number; currency: Currency }>
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { save, remove } = useBudgetMutations(workspaceId)
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)

  useEffect(() => {
    if (!open) return
    setCategoryId(budget?.category_id ?? categories[0]?.id ?? "")
    setAmount(budget ? String(budget.amount) : "")
    setCurrency(budget?.currency ?? defaultCurrency)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, budget?.id])

  const value = parseAmount(amount)
  const valid = Boolean(categoryId) && value > 0
  const average = averages.get(categoryId)
  const options = budget ? categories.filter((c) => c.id === budget.category_id) : categories

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    try {
      await save.mutateAsync({ category_id: categoryId, amount: roundMoney(value, currency), currency })
      toast.success(t("budget.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const destroy = async () => {
    if (!budget) return
    await remove.mutateAsync(budget.id)
    toast.success(t("budget.removed"))
    onOpenChange(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={budget ? t("budget.editTitle") : t("budget.newTitle")}>
      {options.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("budget.allSet")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("budget.category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={Boolean(budget)}>
              <SelectTrigger className="h-12! w-full" aria-label={t("budget.category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <CategoryIcon category={c} className="size-7" />
                    {categoryLabel(c, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-amount">{t("budget.amount")}</Label>
            <div className="flex gap-2">
              <Input
                id="budget-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                className="h-12 flex-1 text-xl font-semibold tabular-nums"
              />
              <div className="w-32">
                <Segmented
                  aria-label={t("walletForm.currency")}
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: "USD", label: "$" },
                    { value: "KHR", label: "៛" },
                  ]}
                />
              </div>
            </div>
            {average && average.amount > 0 && (
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() => {
                  setCurrency(average.currency)
                  setAmount(String(average.amount))
                }}
              >
                {t("budget.averageHint", { amount: formatMoney(average.amount, average.currency) })}
              </button>
            )}
          </div>

          <Button type="submit" className="h-12 w-full text-base" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
          {budget && (
            <Button type="button" variant="ghost" className="w-full text-destructive" onClick={destroy}>
              <Trash2Icon />
              {t("budget.remove")}
            </Button>
          )}
        </form>
      )}
    </BottomSheet>
  )
}
