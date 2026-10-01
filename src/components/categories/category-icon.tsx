import { ArrowLeftRightIcon, CircleHelpIcon } from "lucide-react"

import { getCategoryIcon } from "@/lib/categories/icons"
import type { Category } from "@/lib/data/types"
import { cn } from "@/lib/utils"

/** Round tinted badge with the category's icon; also used for transfers and uncategorised rows. */
export function CategoryIcon({
  category,
  transfer,
  className,
}: {
  category?: Pick<Category, "icon" | "color"> | null
  transfer?: boolean
  className?: string
}) {
  const Icon = transfer ? ArrowLeftRightIcon : category ? getCategoryIcon(category.icon) : CircleHelpIcon
  const color = transfer ? "#64748b" : (category?.color ?? "#94a3b8")
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", className)}
      style={{ backgroundColor: `${color}22`, color }}
      aria-hidden
    >
      <Icon className="size-[45%]" />
    </span>
  )
}
