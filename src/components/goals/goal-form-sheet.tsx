"use client"

import { ArchiveIcon, ArchiveRestoreIcon, ImagePlusIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { CameraScanBar } from "@/components/common/camera-scan-bar"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { stepUp } from "@/components/security/step-up"
import { useWalletMutations } from "@/lib/data/hooks"
import { WalletInUseError, type Currency, type Wallet } from "@/lib/data/types"
import { removeGoalCover, uploadGoalCover, useGoalCoverUrl } from "@/lib/goal-cover"
import { GOAL_PRESETS } from "@/lib/goals"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { savedMessage } from "@/lib/islamic-expressions"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { accountTitle, type AccountRead } from "@/lib/scan"
import { getProvider } from "@/lib/wallets/providers"
import { useSessionStore } from "@/stores/session-store"
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
  // Camera-first: the account number and the balance read from a bank screen (the goal still starts at 0).
  const [accountNo, setAccountNo] = useState<string | null>(null)
  const [scannedBalance, setScannedBalance] = useState<string | null>(null)
  // The cover photo: the stored path, or a new file chosen here (uploaded on save).
  const [cover, setCover] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const storedCoverUrl = useGoalCoverUrl(cover).data
  const userId = useSessionStore((s) => s.user?.id)
  // Qurban and Hajj are offered when the Islamic tools are on.
  const presets = GOAL_PRESETS.filter((p) => (p.key !== "goal_qurban" && p.key !== "goal_hajj") || islamic || goal?.icon === p.key)

  useEffect(() => {
    if (!open) return
    setKind(goal?.icon ?? "goal_house")
    setName(goal?.name ?? t("goals.preset.goal_house"))
    setCurrency(goal?.currency ?? "USD")
    setTarget(goal?.goal_target != null ? String(goal.goal_target) : "")
    setDate(goal?.goal_date ?? "")
    setAccountNo(goal?.account_no ?? null)
    setScannedBalance(null)
    setCover(goal?.cover_path ?? null)
    setCoverFile(null)
    setCoverPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, goal?.id])

  const pick = (key: string) => {
    // Replace the title only while it is still a preset's default.
    const isDefault = !name.trim() || GOAL_PRESETS.some((p) => t(`goals.preset.${p.key}` as MessageKey) === name.trim())
    setKind(key)
    if (isDefault) setName(key === "goal_other" ? "" : t(`goals.preset.${key}` as MessageKey))
  }

  /** A bank account / savings screen: the bank's logo and the account's name, number and balance. */
  const fromScan = (a: AccountRead) => {
    if (a.icon !== "other") setKind(a.icon)
    const title = accountTitle(a, a.icon !== "other" ? getProvider(a.icon).name.km : null)
    if (title) setName(title)
    if (!goal) setCurrency(a.currency)
    if (a.accountNo) setAccountNo(a.accountNo)
    setScannedBalance(a.balance !== null ? formatMoney(a.balance, a.currency) : null)
  }

  const chooseCover = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }
  const clearCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverFile(null)
    setCoverPreview(null)
    setCover(null)
  }

  const [uploading, setUploading] = useState(false)
  const busy = mutations.create.isPending || mutations.update.isPending || uploading
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseAmount(target)
    if (!name.trim()) return void toast.error(t("walletForm.nameRequired"))
    if (!(amount > 0)) return void toast.error(t("goals.targetInvalid"))
    const goal_target = roundMoney(amount, currency)
    try {
      let cover_path = cover
      if (coverFile && userId) {
        setUploading(true)
        try {
          cover_path = await uploadGoalCover(coverFile, userId)
        } finally {
          setUploading(false)
        }
      }
      const extra = { cover_path, account_no: accountNo }
      if (goal) {
        await mutations.update.mutateAsync({ id: goal.id, input: { name: name.trim(), icon: kind, goal_target, goal_date: date || null, ...extra } })
        // The replaced (or removed) photo leaves storage once the goal no longer shows it.
        if (goal.cover_path && goal.cover_path !== cover_path) void removeGoalCover(goal.cover_path)
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
          ...extra,
        })
      }
      // Islamic Mode: «អ៊ីនស៊ាអល់ឡោះ (Insha Allah)» for a new goal (lib/islamic-expressions).
      toast.success(t(savedMessage("GOAL", islamic, !goal)))
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
        {/* Camera-first: a bank account / savings screen fills the bank, name and account number. */}
        <CameraScanBar<AccountRead> kind="account" onRead={fromScan} hint={t("scan.hintAccount")} />
        {scannedBalance && <p className="rounded-xl bg-emerald-500/5 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">{t("scan.goalBalance", { amount: scannedBalance })}</p>}
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
        {/* Cover photo (optional): shown on the goal card. */}
        <div className="space-y-1.5">
          <Label>{t("goals.cover")}</Label>
          {coverPreview || (cover && storedCoverUrl) ? (
            <div className="relative overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private signed URL or a local preview */}
              <img src={coverPreview ?? storedCoverUrl ?? ""} alt="" className="h-32 w-full object-cover" />
              <button type="button" onClick={clearCover} aria-label={t("goals.coverRemove")} className="absolute top-2 right-2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur">
                <XIcon className="size-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => coverInput.current?.click()}>
              <ImagePlusIcon />
              {t("goals.coverAdd")}
            </Button>
          )}
          <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => chooseCover(e.target.files?.[0])} />
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
