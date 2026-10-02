"use client"

import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { stepUp } from "@/components/security/step-up"
import { useWalletMutations } from "@/lib/data/hooks"
import { WalletInUseError, type Currency, type Wallet } from "@/lib/data/types"
import { GOAL_PRESETS } from "@/lib/goals"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Create or edit a savings goal (a savings pot that starts empty; money arrives by transfers). */
export function GoalFormSheet({
  open,
  onOpenChange,
  workspaceId,
  goal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  goal?: Wallet | null
}) {
  const t = useT()
  const islamic = useIslamicEnabled()
  const mutations = useWalletMutations(workspaceId)
  const [kind, setKind] = useState("goal_house")
  const [name, setName] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [target, setTarget] = useState("")
  const [date, setDate] = useState("")
  // Qurban is offered when the Islamic tools are on.
  const presets = GOAL_PRESETS.filter((p) => p.key !== "goal_qurban" || islamic || goal?.icon === "goal_qurban")

  useEffect(() => {
    if (!open) return
    setKind(goal?.icon ?? "goal_house")
    setName(goal?.name ?? t("goals.preset.goal_house"))
    setCurrency(goal?.currency ?? "USD")
    setTarget(goal?.goal_target != null ? String(goal.goal_target) : "")
    setDate(goal?.goal_date ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, goal?.id])

  const pick = (key: string) => {
    // Replace the title only while it is still a preset's default.
    const isDefault = !name.trim() || GOAL_PRESETS.some((p) => t(`goals.preset.${p.key}` as MessageKey) === name.trim())
    setKind(key)
    if (isDefault) setName(key === "goal_other" ? "" : t(`goals.preset.${key}` as MessageKey))
  }

  const busy = mutations.create.isPending || mutations.update.isPending
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseAmount(target)
    if (!name.trim()) return void toast.error(t("walletForm.nameRequired"))
    if (!(amount > 0)) return void toast.error(t("goals.targetInvalid"))
    const goal_target = roundMoney(amount, currency)
    try {
      if (goal) {
        await mutations.update.mutateAsync({ id: goal.id, input: { name: name.trim(), icon: kind, goal_target, goal_date: date || null } })
      } else {
        await mutations.create.mutateAsync({
          name: name.trim(),
          icon: kind,
          color: null,
          visibility: "SHARED",
          currency,
          balance: 0,
          goal_target,
          goal_date: date || null,
        })
      }
      toast.success(t("goals.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const toggleArchive = async () => {
    if (!goal) return
    try {
      await mutations.setArchived.mutateAsync({ id: goal.id, archived: !goal.archived_at })
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }
  const remove = async () => {
    if (!goal || !(await stepUp(t("goals.deleteConfirm", { name: goal.name })))) return
    try {
      await mutations.remove.mutateAsync(goal.id)
      toast.success(t("walletForm.deleted"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof WalletInUseError ? t("goals.inUse") : t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(goal ? "goals.edit" : "goals.new")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              aria-pressed={kind === p.key}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] leading-tight",
                kind === p.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <span className="text-2xl" aria-hidden>
                {p.emoji}
              </span>
              <span className="line-clamp-2 text-center">{t(`goals.kind.${p.key}` as MessageKey)}</span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-name">{t("goals.title")}</Label>
          <Input id="goal-name" className="h-11" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.titlePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-target">{t("goals.target")}</Label>
          <div className="flex gap-2">
            <Input id="goal-target" className="h-11 min-w-0 flex-1 text-base tabular-nums" inputMode="decimal" placeholder="0" value={target} onChange={(e) => setTarget(e.target.value)} />
            <div className="w-28 shrink-0">
              <Segmented
                aria-label={t("walletForm.currency")}
                value={currency}
                onChange={(v) => setCurrency(v as Currency)}
                disabled={Boolean(goal)}
                options={[
                  { value: "USD", label: "$" },
                  { value: "KHR", label: "៛" },
                ]}
              />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-date">{t("goals.date")}</Label>
          <Input id="goal-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {!goal && <p className="text-xs text-muted-foreground">{t("goals.howItWorks")}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {goal && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={toggleArchive}>
              {goal.archived_at ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {t(goal.archived_at ? "walletForm.unarchive" : "walletForm.archive")}
            </Button>
            <Button type="button" variant="outline" className="text-destructive" onClick={remove}>
              <Trash2Icon />
              {t("walletForm.delete")}
            </Button>
          </div>
        )}
      </form>
    </BottomSheet>
  )
}
