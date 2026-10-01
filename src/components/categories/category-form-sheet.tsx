"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, Loader2Icon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORY_ICONS } from "@/lib/categories/icons"
import { CATEGORY_COLORS, categoryLabel } from "@/lib/categories/presets"
import { useCategoryMutations } from "@/lib/data/hooks"
import type { Category, CategoryType } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

import { CategoryIcon } from "./category-icon"

const schema = z.object({
  name: z.string().trim().min(1, "walletForm.nameRequired").max(60),
  type: z.enum(["INCOME", "EXPENSE"]),
  icon: z.string(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
})
type FormValues = z.infer<typeof schema>

type CategoryFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  category?: Category | null
  /** Type for a new category. */
  defaultType?: CategoryType
  /** When editing a category in use its type is locked. */
  typeLocked?: boolean
  onSaved?: (category: Category) => void
}

export function CategoryFormSheet({
  open,
  onOpenChange,
  workspaceId,
  category,
  defaultType = "EXPENSE",
  typeLocked,
  onSaved,
}: CategoryFormSheetProps) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const mutations = useCategoryMutations(workspaceId)

  const defaults = (): FormValues =>
    category
      ? {
          name: categoryLabel(category, locale),
          type: category.type,
          icon: category.icon ?? "ellipsis",
          color: category.color ?? CATEGORY_COLORS[0],
        }
      : { name: "", type: defaultType, icon: "shopping-bag", color: CATEGORY_COLORS[1] }

  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  })
  const [icon, color] = useWatch({ control, name: ["icon", "color"] })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, category?.id])

  const onSubmit = handleSubmit(async (values) => {
    // Keep a preset's stored (Khmer) name unless the user actually renamed it.
    const name = category && values.name.trim() === categoryLabel(category, locale) ? category.name : values.name.trim()
    const input = { ...values, name }
    try {
      const saved = category
        ? await mutations.update.mutateAsync({ id: category.id, input })
        : await mutations.create.mutateAsync(input)
      toast.success(t("category.saved"))
      onOpenChange(false)
      onSaved?.(saved)
    } catch {
      toast.error(t("common.error"))
    }
  })

  const remove = async () => {
    if (!category || !window.confirm(t("category.deleteConfirm", { name: categoryLabel(category, locale) }))) return
    await mutations.remove.mutateAsync(category.id)
    toast.success(t("category.deleted"))
    onOpenChange(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={category ? t("category.edit") : t("category.new")}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex items-center gap-3">
          <CategoryIcon category={{ icon, color }} className="size-12" />
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="category-name">{t("category.name")}</Label>
            <Input id="category-name" className="h-11" maxLength={60} {...register("name")} />
          </div>
        </div>
        {formState.errors.name && (
          <p className="-mt-3 text-sm text-destructive">{t(formState.errors.name.message as MessageKey)}</p>
        )}

        <div className="space-y-2">
          <Label>{t("category.type")}</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Segmented
                aria-label={t("category.type")}
                value={field.value}
                onChange={field.onChange}
                disabled={typeLocked}
                options={[
                  { value: "EXPENSE", label: <span className="inline-flex items-center gap-1"><MinusIcon className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden />{t("tx.EXPENSE")}</span> },
                  { value: "INCOME", label: <span className="inline-flex items-center gap-1"><PlusIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />{t("tx.INCOME")}</span> },
                ]}
              />
            )}
          />
          {typeLocked && category && <p className="text-xs text-muted-foreground">{t("category.typeLocked")}</p>}
        </div>

        <div className="space-y-2">
          <Label>{t("category.color")}</Label>
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => field.onChange(c)}
                    className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background"
                    style={{ backgroundColor: c, boxShadow: field.value === c ? `0 0 0 2px ${c}` : undefined }}
                    aria-label={c}
                    aria-pressed={field.value === c}
                  >
                    {field.value === c && <CheckIcon className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("category.icon")}</Label>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <div className="grid grid-cols-7 gap-1.5">
                {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => field.onChange(key)}
                    aria-label={key}
                    aria-pressed={field.value === key}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border transition-colors",
                      field.value === key ? "border-transparent" : "hover:bg-muted",
                    )}
                    style={field.value === key ? { backgroundColor: `${color}22`, color, borderColor: color } : undefined}
                  >
                    <Icon className="size-5" />
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {category && (
          <Button type="button" variant="outline" className="w-full text-destructive" onClick={remove}>
            <Trash2Icon />
            {t("common.delete")}
          </Button>
        )}
      </form>
    </BottomSheet>
  )
}
