"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { CheckIcon, CircleCheckBigIcon, CopyIcon, CrownIcon, DownloadIcon, LifeBuoyIcon, Loader2Icon, MinusIcon, SendIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { usePlan, usePlanOptions, useUpgradeStore, type UpgradeReason } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSupportContacts } from "@/lib/support"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

type PaymentRow = { id: string; plan_code: string; amount: number; currency: Currency; method: string; reference: string | null; status: string; created_at: string; note: string | null }
/** Set in /admin › Payment details. khqr_image_url: the shop's static KHQR (e.g. from the ABA app). */
export type PaymentInstructions = {
  bank?: string
  account_name?: string
  account_number?: string
  khqr_image_url?: string
  note_km?: string
  note_en?: string
}

/** Free vs Pro rows; the Free column mirrors the FREE row in public.plans. */
const COMPARE: { label: MessageKey; free: MessageKey | false; pro: MessageKey | true }[] = [
  { label: "upgrade.row.wallets", free: "upgrade.free.wallets", pro: "upgrade.unlimited" },
  { label: "upgrade.row.family", free: "upgrade.free.family", pro: "upgrade.unlimited" },
  { label: "upgrade.row.ai", free: "upgrade.free.ai", pro: "upgrade.pro.ai" },
  { label: "upgrade.row.reconcile", free: false, pro: true },
  { label: "upgrade.row.export", free: false, pro: true },
  { label: "upgrade.row.score", free: false, pro: true },
]

function usePayments(enabled: boolean) {
  return useQuery({
    queryKey: ["payments-mine"],
    enabled,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()!
      const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(5)
      if (error) throw error
      return (data as PaymentRow[]).map((p) => ({ ...p, amount: Number(p.amount) }))
    },
  })
}

export function usePaymentInstructions(enabled: boolean) {
  return useQuery({
    queryKey: ["payment-instructions"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()!
      const { data } = await supabase.from("app_settings").select("value").eq("key", "payment_instructions").maybeSingle()
      return (data?.value ?? {}) as PaymentInstructions
    },
  })
}

/** Short code the admin can match with the slip on Telegram. */
export const paymentCode = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase()

/** Saves the KHQR image to the phone (share sheet → "Save image"), or downloads it. */
async function saveQrImage(url: string) {
  try {
    const res = await fetch(url, { cache: "force-cache" })
    const blob = await res.blob()
    const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"
    const file = new File([blob], `luysmart-khqr.${ext}`, { type: blob.type || "image/png" })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "KHQR" })
        return
      } catch {
        // cancelled: fall back to a download
      }
    }
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch {
    // Last resort: open it so the user can long-press → Save image.
    window.open(url, "_blank", "noopener")
  }
}

/** Global upgrade sheet; open it anywhere with showUpgrade(reason). */
export function UpgradeSheet() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const queryClient = useQueryClient()
  const { open, reason, close } = useUpgradeStore()
  const user = useSessionStore((s) => s.user)
  const signedIn = Boolean(user)
  const { plan, isPro } = usePlan()
  const options = usePlanOptions()
  const payments = usePayments(open && signedIn)
  const instructions = usePaymentInstructions(open && signedIn).data ?? {}
  const contacts = useSupportContacts().data
  const [planCode, setPlanCode] = useState("PRO_YEARLY")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [reference, setReference] = useState("")
  const [sent, setSent] = useState<PaymentRow | null>(null)

  useEffect(() => {
    if (!open) setSent(null)
  }, [open])

  const chosen = options.find((o) => o.code === planCode) ?? options[0]
  const monthly = options.find((o) => o.code === "PRO_MONTHLY")
  const saving =
    monthly && chosen?.period_days && chosen.period_days >= 365
      ? Math.round((1 - chosen.price_usd / (monthly.price_usd * 12)) * 100)
      : 0
  const pending = payments.data?.filter((p) => p.status === "PENDING") ?? []
  const qrUrl = instructions.khqr_image_url

  const request = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseBrowserClient()!
      const { data, error } = await supabase.rpc("request_upgrade", {
        p_plan_code: planCode,
        p_method: qrUrl ? "KHQR" : "BANK_TRANSFER",
        p_reference: reference,
        p_currency: currency,
      })
      if (error) throw error
      return data as PaymentRow
    },
    onSuccess: (row) => {
      setReference("")
      setSent({ ...row, amount: Number(row.amount) })
      void queryClient.invalidateQueries({ queryKey: ["payments-mine"] })
    },
    onError: (error) => toast.error(/too_many_pending/.test(String((error as Error).message)) ? t("upgrade.tooMany") : t("common.error")),
  })

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("cancel_upgrade_request", { p_payment_id: id })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["payments-mine"] }),
  })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("family.codeCopied"))
    } catch {
      toast.error(text)
    }
  }

  const price = (o: (typeof options)[number]) => (currency === "USD" ? formatMoney(o.price_usd, "USD") : formatMoney(o.price_khr, "KHR"))
  const note = locale === "km" ? instructions.note_km : instructions.note_en

  // --- after "I have paid" ---------------------------------------------------------
  if (sent) {
    const code = paymentCode(sent.id)
    return (
      <BottomSheet open={open} onOpenChange={(v) => !v && close()} title={t("upgrade.title")}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CircleCheckBigIcon className="size-14 text-[#10B981]" aria-hidden />
          <p className="text-lg font-semibold">{t("upgrade.sentTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("upgrade.sentSlip")}</p>
          <button
            type="button"
            onClick={() => copy(code)}
            className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-2 font-mono text-lg font-bold tracking-widest"
            aria-label={t("family.copyCode")}
          >
            #{code}
            <CopyIcon className="size-4 text-muted-foreground" aria-hidden />
          </button>
          <p className="text-xs text-muted-foreground">
            {formatMoney(sent.amount, sent.currency)} · {t(sent.plan_code === "PRO_YEARLY" ? "upgrade.yearly" : "upgrade.monthly")}
          </p>
          {contacts?.telegram_url ? (
            <Button asChild className="h-12 w-full bg-[#229ED9] text-base text-white hover:bg-[#229ED9]/90">
              <a href={contacts.telegram_url} target="_blank" rel="noopener noreferrer" onClick={() => void navigator.clipboard?.writeText(`#${code}`).catch(() => {})}>
                <SendIcon />
                {t("upgrade.sendSlip")}
              </a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("upgrade.reviewHint")}</p>
          )}
          <Button variant="ghost" className="w-full" onClick={close}>
            {t("upgrade.done")}
          </Button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && close()} title={t("upgrade.title")} description={t(`upgrade.reason.${reason satisfies UpgradeReason}`)}>
      <div className="space-y-5">
        {isPro && plan.period_end && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <CrownIcon className="size-4 shrink-0" aria-hidden />
            {t("upgrade.youArePro", { date: format(new Date(plan.period_end), "dd/MM/yyyy") })}
          </p>
        )}

        {/* Free vs Pro */}
        <div className="overflow-hidden rounded-xl border text-sm">
          <div className="grid grid-cols-[1fr_5.5rem_6.5rem] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span />
            <span className="text-center">{t("plan.free")}</span>
            <span className="text-center text-primary">PRO</span>
          </div>
          {COMPARE.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_5.5rem_6.5rem] items-center border-t px-3 py-2">
              <span>{t(row.label)}</span>
              <span className="text-center text-xs text-muted-foreground">
                {row.free === false ? <MinusIcon className="mx-auto size-4" aria-label="—" /> : t(row.free)}
              </span>
              <span className="text-center text-xs font-medium">
                {row.pro === true ? <CheckIcon className="mx-auto size-4 text-primary" aria-label="✓" /> : t(row.pro)}
              </span>
            </div>
          ))}
        </div>

        {!signedIn ? (
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">{t("upgrade.needAccount")}</p>
            <Button
              className="h-12 w-full text-base"
              onClick={() => {
                close()
                router.push("/login")
              }}
            >
              {t("home.createAccount")}
            </Button>
          </div>
        ) : (
          <>
            {/* Plan + currency */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("upgrade.choosePlan")}</Label>
                <div className="w-28">
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
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {options.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    role="radio"
                    aria-checked={planCode === o.code}
                    onClick={() => setPlanCode(o.code)}
                    className={cn(
                      "relative rounded-xl border p-3 text-left transition-colors",
                      planCode === o.code ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <p className="text-xs text-muted-foreground">{t(o.code === "PRO_YEARLY" ? "upgrade.yearly" : "upgrade.monthly")}</p>
                    <p className="text-lg font-bold tabular-nums">{price(o)}</p>
                    {o.code === "PRO_YEARLY" && saving > 0 && (
                      <span className="absolute -top-2 right-2 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {t("upgrade.save", { percent: saving })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Static KHQR (or the bank account when no QR is set) */}
            <div className="space-y-3 rounded-2xl border p-4">
              {qrUrl && (
                <div className="mx-auto w-full max-w-60 overflow-hidden rounded-xl border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image on Supabase Storage */}
                  <img src={qrUrl} alt="KHQR" className="aspect-square w-full object-contain" />
                </div>
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{t("upgrade.payExactly")}</p>
                <p className="text-3xl font-bold tabular-nums">{chosen ? price(chosen) : "—"}</p>
              </div>
              {(instructions.account_name || instructions.account_number) && (
                <div className="space-y-1 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                  {instructions.account_name && (
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("upgrade.accountName")}</span>
                      <span className="font-semibold">{instructions.account_name}</span>
                    </p>
                  )}
                  {instructions.account_number && (
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{instructions.bank || t("upgrade.accountNumber")}</span>
                      <button type="button" onClick={() => copy(instructions.account_number!)} className="flex items-center gap-1.5 font-mono font-semibold tracking-wider">
                        {instructions.account_number}
                        <CopyIcon className="size-3.5 text-muted-foreground" aria-label={t("family.copyCode")} />
                      </button>
                    </p>
                  )}
                </div>
              )}
              {!qrUrl && !instructions.account_number && <p className="text-center text-sm text-muted-foreground">{t("upgrade.noInstructions")}</p>}
              {qrUrl && (
                <Button variant="outline" className="h-11 w-full" onClick={() => void saveQrImage(qrUrl)}>
                  <DownloadIcon />
                  {t("upgrade.saveQr")}
                </Button>
              )}
              <p className="text-center text-sm font-medium">{t(qrUrl ? "upgrade.scanThenTap" : "upgrade.transferThenTap")}</p>
              {note && <p className="text-center text-xs whitespace-pre-line text-muted-foreground">{note}</p>}
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                request.mutate()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">{t("upgrade.referenceOptional")}</Label>
                <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="TRX…" />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={request.isPending}>
                {request.isPending ? <Loader2Icon className="animate-spin" /> : <CrownIcon />}
                {t("upgrade.iHavePaid")}
              </Button>
            </form>
            <Link
              href="/support?category=PAYMENT&from=upgrade"
              onClick={close}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              <LifeBuoyIcon className="size-3.5" aria-hidden />
              {t("upgrade.needHelp")}
            </Link>

            {pending.length > 0 && (
              <ul className="space-y-1.5">
                {pending.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <Loader2Icon className="size-4 shrink-0 animate-spin text-amber-600" aria-hidden />
                    <span className="flex-1">
                      {t("upgrade.pending", { amount: formatMoney(p.amount, p.currency), date: format(new Date(p.created_at), "dd/MM HH:mm") })}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">#{paymentCode(p.id)}</span>
                    </span>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => cancel.mutate(p.id)} aria-label={t("upgrade.cancelRequest")}>
                      <XIcon className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
