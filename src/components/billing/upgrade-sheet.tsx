"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { CheckIcon, CopyIcon, CrownIcon, LifeBuoyIcon, Loader2Icon, MinusIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { usePlan, usePlanOptions, useUpgradeStore, type UpgradeReason } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

type PaymentRow = { id: string; plan_code: string; amount: number; currency: Currency; method: string; reference: string | null; status: string; created_at: string; note: string | null }
type Instructions = { bank?: string; account_name?: string; account_number?: string; note_km?: string; note_en?: string }

const METHODS = ["BANK_TRANSFER", "KHQR", "CASH", "OTHER"] as const

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

function useInstructions(enabled: boolean) {
  return useQuery({
    queryKey: ["payment-instructions"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()!
      const { data } = await supabase.from("app_settings").select("value").eq("key", "payment_instructions").maybeSingle()
      return (data?.value ?? {}) as Instructions
    },
  })
}

/** Global upgrade sheet; open it anywhere with showUpgrade(reason). */
export function UpgradeSheet() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const queryClient = useQueryClient()
  const { open, reason, close } = useUpgradeStore()
  const { user, isGuest, endGuest } = useSessionStore()
  const signedIn = Boolean(user)
  const { plan, isPro } = usePlan()
  const options = usePlanOptions()
  const payments = usePayments(open && signedIn)
  const instructions = useInstructions(open && signedIn).data ?? {}
  const [planCode, setPlanCode] = useState("PRO_YEARLY")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [method, setMethod] = useState<(typeof METHODS)[number]>("BANK_TRANSFER")
  const [reference, setReference] = useState("")

  const chosen = options.find((o) => o.code === planCode) ?? options[0]
  const monthly = options.find((o) => o.code === "PRO_MONTHLY")
  const saving =
    monthly && chosen?.period_days && chosen.period_days >= 365
      ? Math.round((1 - chosen.price_usd / (monthly.price_usd * 12)) * 100)
      : 0
  const pending = payments.data?.filter((p) => p.status === "PENDING") ?? []

  const request = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseBrowserClient()!
      const { error } = await supabase.rpc("request_upgrade", {
        p_plan_code: planCode,
        p_method: method,
        p_reference: reference,
        p_currency: currency,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setReference("")
      toast.success(t("upgrade.sent"))
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
                if (isGuest) endGuest()
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

            {/* How to pay (set by the admin) */}
            <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-sm">
              <p className="font-medium">{t("upgrade.howToPay", { amount: chosen ? price(chosen) : "" })}</p>
              {instructions.account_number ? (
                <div className="space-y-0.5">
                  {instructions.bank && <p>{instructions.bank}</p>}
                  {instructions.account_name && <p className="text-muted-foreground">{instructions.account_name}</p>}
                  <button
                    type="button"
                    onClick={() => copy(instructions.account_number!)}
                    className="flex items-center gap-1.5 font-mono font-semibold tracking-wider"
                  >
                    {instructions.account_number}
                    <CopyIcon className="size-3.5 text-muted-foreground" aria-label={t("family.copyCode")} />
                  </button>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("upgrade.noInstructions")}</p>
              )}
              {note && <p className="text-xs whitespace-pre-line text-muted-foreground">{note}</p>}
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                request.mutate()
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("upgrade.method")}</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`upgrade.method.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-ref">{t("upgrade.reference")}</Label>
                  <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="TRX..." />
                </div>
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={request.isPending}>
                {request.isPending ? <Loader2Icon className="animate-spin" /> : <CrownIcon />}
                {t("upgrade.paid")}
              </Button>
              <p className="text-center text-xs text-muted-foreground">{t("upgrade.reviewHint")}</p>
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
