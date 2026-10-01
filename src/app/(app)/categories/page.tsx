"use client"

import { ArrowLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { CategoryFormSheet } from "@/components/categories/category-form-sheet"
import { CategoryIcon } from "@/components/categories/category-icon"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { categoryLabel } from "@/lib/categories/presets"
import { useActiveWorkspace, useCategories, useTransactions } from "@/lib/data/hooks"
import type { Category, CategoryType } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"

export default function CategoriesPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { workspace } = useActiveWorkspace()
  const categoriesQuery = useCategories(workspace?.id)
  const [type, setType] = useState<CategoryType>("EXPENSE")
  const [editing, setEditing] = useState<Category | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  // Is the edited category in use? (its type is then locked)
  const usage = useTransactions(editing ? workspace?.id : undefined, { categoryId: editing?.id, limit: 1 })

  const list = categoriesQuery.data?.filter((c) => c.type === type) ?? []

  const open = (category: Category | null) => {
    setEditing(category)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/settings">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-bold">{t("categories.title")}</h1>
        <Button size="sm" onClick={() => open(null)}>
          <PlusIcon />
          {t("category.add")}
        </Button>
      </div>

      <Segmented
        aria-label={t("category.type")}
        value={type}
        onChange={setType}
        options={[
          { value: "EXPENSE", label: `➖ ${t("tx.EXPENSE")}` },
          { value: "INCOME", label: `➕ ${t("tx.INCOME")}` },
        ]}
      />

      {categoriesQuery.isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => open(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
            >
              <CategoryIcon category={c} />
              <span className="flex-1 text-sm font-medium">{categoryLabel(c, locale)}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
        </Card>
      )}

      <CategoryFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspace?.id}
        category={editing}
        defaultType={type}
        typeLocked={Boolean(editing) && (usage.data?.length ?? 0) > 0}
      />
    </div>
  )
}
