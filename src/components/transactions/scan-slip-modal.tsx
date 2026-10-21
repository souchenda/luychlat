"use client"

import { BotIcon, CameraIcon, ImageIcon, Loader2Icon, PencilLineIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { WalletSelect } from "@/components/wallets/wallet-select"
import type { Slip } from "@/lib/bot/bank-slip"
import { usableWallets, useCategories, useTransactionMutations } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import type { Wallet } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { compressImage } from "@/lib/image"
import { savedMessage } from "@/lib/islamic-expressions"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { formatMoney } from "@/lib/money"
import { SLIP_BOT_URL } from "@/lib/quick-actions"
import { slipCategoryChoices, slipEntryInput, slipErrorKey, slipKind, slipWallet, suggestedChoice, type SlipScanResponse } from "@/lib/slip-intake"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

type Phase = { step: "pick" } | { step: "reading" } | { step: "preview"; slip: Slip; photo: Blob } | { step: "error"; message: MessageKey }

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/**
 * «ស្កេនវិក្កយបត្រ» in the app (founder, 21/10/2026 — the tile used to open t.me/luychlat_bot in a browser tab): take or
 * pick a slip photo → the bot's reader (/api/slip) → the amount, bank, wallet and category to confirm → 💾 saves the
 * entry with the photo as its receipt. The wallet is preselected only when the slip settles it (lib/slip-intake.ts);
 * the bot stays one small link away for bills, loan schedules and account screens.
 */
export function ScanSlipModal({
  open,
  onOpenChange,
  workspaceId,
  wallets,
  onManual,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  wallets: Wallet[]
  /** The ordinary entry sheet, when the slip can't be read. */
  onManual: () => void
}) {
  const t = useT()
  const userId = useSessionStore((s) => s.user?.id)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const islamic = useIslamicEnabled()
  const categoriesQuery = useCategories(workspaceId)
  const mutations = useTransactionMutations(workspaceId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ step: "pick" })
  const [walletId, setWalletId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [saving, setSaving] = useState(false)

  // Savings goals only take transfers; archived wallets take nothing.
  const usable = useMemo(() => usableWallets(wallets, userId).filter((w) => !w.archived_at), [wallets, userId])
  const slip = phase.step === "preview" ? phase.slip : null
  const kind = slip ? slipKind(slip) : "EXPENSE"
  const pick = useMemo(() => (slip ? slipWallet(slip, usable) : null), [slip, usable])
  const choices = useMemo(() => slipCategoryChoices(kind, categoriesQuery.data ?? []), [kind, categoriesQuery.data])
  const wallet = usable.find((w) => w.id === walletId)
  const choice = choices.find((c) => c.categoryId === categoryId) ?? null

  const reset = () => {
    setPhase({ step: "pick" })
    setWalletId("")
    setCategoryId("")
  }
  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) reset()
  }

  const read = async (file: File | undefined) => {
    if (cameraRef.current) cameraRef.current.value = ""
    if (galleryRef.current) galleryRef.current.value = ""
    if (!file) return
    setPhase({ step: "reading" })
    try {
      // Upright, no EXIF, small enough to send from a phone on 4G; the same image is kept as the receipt.
      const photo = await compressImage(file, 1600, 0.85)
      const body = new FormData()
      body.append("image", new File([photo], "slip.jpg", { type: "image/jpeg" }))
      const res = await fetch("/api/slip", { method: "POST", body }).catch(() => null)
      const answer = (await res?.json().catch(() => null)) as SlipScanResponse | null
      if (!answer) return setPhase({ step: "error", message: "scanSlip.busy" })
      if ("error" in answer) return setPhase({ step: "error", message: slipErrorKey(answer.error) })
      const found = slipWallet(answer.slip, usable)
      setWalletId(found.walletId ?? "")
      const suggested = suggestedChoice(answer.slip)
      setCategoryId(slipCategoryChoices(slipKind(answer.slip), categoriesQuery.data ?? []).find((c) => c.label === suggested)?.categoryId ?? "")
      setPhase({ step: "preview", slip: answer.slip, photo })
    } catch {
      setPhase({ step: "error", message: "scanSlip.unreadable" })
    }
  }

  const save = async () => {
    if (phase.step !== "preview" || !wallet || !choice) return
    setSaving(true)
    try {
      const receipt = await mutations.uploadReceipt.mutateAsync(phase.photo)
      const preset = categoriesQuery.data?.find((c) => c.id === choice.categoryId)?.preset_key ?? null
      await mutations.createEntry.mutateAsync(slipEntryInput(phase.slip, { wallet, category: { ...choice, preset }, tagText: t(choice.label), rate: khrPerUsd, receipt }))
      toast.success(t(savedMessage(kind, islamic, true)))
      close(false)
    } catch {
      toast.error(t("common.error"))
    } finally {
      setSaving(false)
    }
  }

  const converted = slip && wallet && wallet.currency !== slip.currency ? amountInWalletCurrency(slip.amount, slip.currency, khrPerUsd, wallet.currency) : null

  return (
    <BottomSheet open={open} onOpenChange={close} title={t("scanSlip.title")} description={phase.step === "pick" ? t("scanSlip.hint") : undefined}>
      {/* Two inputs: the camera straight away on a phone (capture), and the photo library / a file on a computer. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => read(e.target.files?.[0])} data-testid="slip-camera" />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => read(e.target.files?.[0])} data-testid="slip-gallery" />

      <div className="space-y-4 px-4 pb-6">
        {phase.step === "pick" || phase.step === "error" ? (
          <>
            {phase.step === "error" && (
              <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                {t(phase.message)}
              </p>
            )}
            <Button type="button" className="h-14 w-full justify-start gap-3 rounded-2xl text-base" onClick={() => cameraRef.current?.click()}>
              <CameraIcon className="size-5" aria-hidden />
              {t("scanSlip.camera")}
            </Button>
            <Button type="button" variant="outline" className="h-14 w-full justify-start gap-3 rounded-2xl text-base" onClick={() => galleryRef.current?.click()}>
              <ImageIcon className="size-5" aria-hidden />
              {t("scanSlip.gallery")}
            </Button>
            {phase.step === "error" && (
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full justify-start gap-3 rounded-2xl"
                onClick={() => {
                  close(false)
                  onManual()
                }}
              >
                <PencilLineIcon className="size-5" aria-hidden />
                {t("scanSlip.manual")}
              </Button>
            )}
            <a href={SLIP_BOT_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline">
              <BotIcon className="size-4" aria-hidden />
              {t("scanSlip.bot")} ↗
            </a>
          </>
        ) : phase.step === "reading" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
            <Loader2Icon className="size-8 animate-spin text-emerald-600" aria-hidden />
            <p className="text-sm font-medium">{t("scanSlip.reading")}</p>
          </div>
        ) : (
          <>
            {/* The slip as read: the bank and direction, the exact amount, when and with whom. */}
            <div className="rounded-3xl border border-emerald-400/25 bg-card p-4 shadow-md shadow-emerald-950/10 dark:border-emerald-500/30 dark:shadow-none">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  {t("scanSlip.bank")} · <span className="font-medium text-foreground">{phase.slip.bank ?? "—"}</span>
                </span>
                <span className={cn("shrink-0 font-medium", kind === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  {t(kind === "INCOME" ? "scanSlip.in" : "scanSlip.out")}
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums" data-testid="slip-amount">
                {formatMoney(phase.slip.amount, phase.slip.currency)}
              </p>
              {(phase.slip.date || phase.slip.party) && (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {[phase.slip.date ? `${ddmmyyyy(phase.slip.date)}${phase.slip.time ? ` ${phase.slip.time}` : ""}` : null, phase.slip.party ? `${kind === "INCOME" ? "←" : "→"} ${phase.slip.party}` : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {usable.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("scanSlip.noWallet")}</p>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("scanSlip.wallet")}</Label>
                <WalletSelect wallets={pick?.choices ?? usable} value={walletId} onChange={setWalletId} label={t("scanSlip.wallet")} />
                {!pick?.walletId && !walletId && <p className="text-xs text-amber-700 dark:text-amber-300">{t("scanSlip.pickWallet")}</p>}
                {converted != null && wallet && <p className="text-xs text-muted-foreground">{t("scanSlip.converted", { amount: formatMoney(converted, wallet.currency) })}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("scanSlip.category")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {choices.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    aria-pressed={c.categoryId === categoryId && choice?.label === c.label}
                    onClick={() => setCategoryId(c.categoryId)}
                    className={cn(
                      "min-h-12 rounded-2xl border px-3 text-sm font-medium transition-colors",
                      c.categoryId === categoryId && choice?.label === c.label ? "border-emerald-600 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200" : "hover:bg-muted/60",
                    )}
                  >
                    {/* The bot's buttons carry an emoji; the app's chips are plain words (UI style). */}
                    {t(c.label).replace(/^\S+\s/, "")}
                  </button>
                ))}
              </div>
            </div>

            <Button type="button" className="h-14 w-full gap-2 rounded-2xl text-base" disabled={!wallet || !choice || saving} onClick={save}>
              {saving ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <SaveIcon className="size-5" aria-hidden />}
              {t("scanSlip.save")}
            </Button>
            <Button type="button" variant="ghost" className="h-11 w-full gap-2 rounded-2xl" onClick={reset} disabled={saving}>
              <RotateCcwIcon className="size-4" aria-hidden />
              {t("scanSlip.again")}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
