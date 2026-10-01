"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, GiftIcon, Share2Icon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useRefreshPlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/** A referral link opened before signing up is remembered here and redeemed after sign-in. */
const PENDING_REF_KEY = "luysmart-pending-ref"
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

type MyReferral = { code: string; invited: number; days_earned: number; referred_by: string | null; can_redeem: boolean }
type RedeemStatus = "ok" | "invalid" | "own_code" | "already_redeemed" | "too_late" | "rate_limited"

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "")

export function referralLink(code: string) {
  return `${window.location.origin}/login?ref=${code}`
}

function useMyReferral() {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: ["referral", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("my_referral")
      if (error) throw error
      return data as MyReferral
    },
  })
}

function useRedeem() {
  const t = useT()
  const queryClient = useQueryClient()
  const refreshPlan = useRefreshPlan()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("redeem_referral", { p_code: normalize(code) })
      if (error) throw error
      return (data as { status: RedeemStatus }).status
    },
    onSuccess: (status) => {
      if (status === "ok") {
        toast.success(t("referral.redeemed"))
        void refreshPlan()
        void queryClient.invalidateQueries({ queryKey: ["referral"] })
      } else {
        toast.error(t(`referral.error.${status}` as MessageKey))
      }
    },
    onError: () => toast.error(t("common.error")),
  })
}

/** On the login page: remembers ?ref=CODE until the user has an account. */
export function ReferralCapture() {
  const t = useT()
  const params = useSearchParams()
  const code = normalize(params.get("ref") ?? "")
  const valid = CODE_RE.test(code)

  useEffect(() => {
    if (!valid) return
    try {
      localStorage.setItem(PENDING_REF_KEY, code)
    } catch {
      // Storage blocked: the code can still be typed in Settings.
    }
  }, [valid, code])

  if (!valid) return null
  return (
    <p className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
      <GiftIcon className="size-4 shrink-0" aria-hidden />
      {t("referral.invitedBanner")}
    </p>
  )
}

/** After sign-in: redeems a remembered referral code once. */
export function PendingReferralRedeemer() {
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const redeem = useRedeem()
  const started = useRef(false)

  useEffect(() => {
    if (!signedIn || started.current) return
    let code: string | null = null
    try {
      code = localStorage.getItem(PENDING_REF_KEY)
      localStorage.removeItem(PENDING_REF_KEY)
    } catch {
      return
    }
    if (!code) return
    started.current = true
    redeem.mutate(code)
  }, [signedIn, redeem])

  return null
}

/** Settings: "Refer a Friend" — code, share link, numbers, and redeeming a friend's code. */
export function ReferralCard() {
  const t = useT()
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const { data } = useMyReferral()
  const redeem = useRedeem()
  const [input, setInput] = useState("")

  if (!signedIn || !data) return null
  const link = referralLink(data.code)

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("family.codeCopied"))
    } catch {
      toast.error(text)
    }
  }

  const share = async () => {
    const text = t("referral.shareText", { code: data.code })
    if (navigator.share) {
      try {
        await navigator.share({ title: t("app.name"), text, url: link })
        return
      } catch {
        // Cancelled: fall through to copy.
      }
    }
    await copy(`${text}\n${link}`)
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("referral.title")}</h2>
      <Card className="gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">{t("referral.hint")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copy(data.code)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 py-2.5 font-mono text-xl font-bold tracking-[0.2em] text-primary"
            aria-label={t("family.copyCode")}
          >
            {data.code}
            <CopyIcon className="size-4" aria-hidden />
          </button>
          <Button className="h-12" onClick={share}>
            <Share2Icon />
            {t("referral.share")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 py-2">
            <p className="text-xl font-bold tabular-nums">{data.invited}</p>
            <p className="text-xs text-muted-foreground">{t("referral.invited")}</p>
          </div>
          <div className="rounded-xl bg-muted/60 py-2">
            <p className="text-xl font-bold tabular-nums">{data.days_earned}</p>
            <p className="text-xs text-muted-foreground">{t("referral.daysEarned")}</p>
          </div>
        </div>
        {data.referred_by ? (
          <p className="text-xs text-muted-foreground">{t("referral.usedCode", { code: data.referred_by })}</p>
        ) : (
          data.can_redeem && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (CODE_RE.test(normalize(input))) redeem.mutate(input)
                else toast.error(t("referral.error.invalid"))
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("referral.enterCode")}
                maxLength={12}
                autoCapitalize="characters"
                className="font-mono uppercase"
                aria-label={t("referral.enterCode")}
              />
              <Button type="submit" variant="secondary" disabled={redeem.isPending}>
                {t("referral.redeem")}
              </Button>
            </form>
          )
        )}
      </Card>
    </section>
  )
}
