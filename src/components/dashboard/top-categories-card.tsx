"use client"

import { TopSpending } from "@/components/dashboard/cash-flow-charts"
import { Card } from "@/components/ui/card"
import type { Category, Transaction } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"

/** Home: this month's top spending categories as horizontal bars (one hue, labels carry the identity). */
export function TopCategoriesCard({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const t = useT()
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[15px] font-semibold">{t("home.topCategories")}</h2>
      <Card className="px-4 py-4">
        <TopSpending transactions={transactions} categories={categories} />
      </Card>
    </section>
  )
}
