"use client"

import { PlusIcon } from "lucide-react"

import { categoryLabel } from "@/lib/categories/presets"
import type { Category } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

import { CategoryIcon } from "./category-icon"

/** Grid of categories (already filtered by type) with an "add" tile. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  onAdd,
}: {
  categories: Category[]
  value: string | null
  onChange: (id: string) => void
  onAdd: () => void
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)

  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t("entry.category")}>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onChange(c.id)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] leading-tight transition-colors",
            value === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-transparent hover:bg-muted",
          )}
        >
          <CategoryIcon category={c} className="size-9" />
          <span className="line-clamp-2 text-center">{categoryLabel(c, locale)}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-1.5 text-[11px] text-muted-foreground hover:bg-muted"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-muted">
          <PlusIcon className="size-4" />
        </span>
        {t("category.add")}
      </button>
    </div>
  )
}
