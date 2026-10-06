"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, MoonIcon, SendIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

type Status = { status: "ACTIVE" | "DORMANT" | "DELETED"; telegram: boolean }

/**
 * Accounts asleep after 6+ months without activity: their data is closed
 * (account_ok) until they wake it — with a Telegram code when Telegram is
 * linked, otherwise with the sign-in they just did. Everyone else passes through.
 */
export function DormantGate({ children }: { children: React.ReactNode }) {
  const userId = useSessionStore((s) => s.user?.id)
  const { data } = useQuery({
    queryKey: ["account-status", userId],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("my_account_status")
      if (error) throw error
      return data as Status
    },
  })
  if (data?.status !== "DORMANT") return children
  return <DormantScreen telegram={data.telegram} />
}

function DormantScreen({ telegram }: { telegram: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const email = useSessionStore((s) => s.user?.email)
  const [step, setStep] = useState<"start" | "code">("start")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const wake = async (grant: string | null) => {
    const { error } = await getSupabaseBrowserClient()!.rpc("reactivate_dormant", { p_grant: grant })
    if (error) {
      if (/reauth_required/.test(error.message)) {
        // The sign-in is too old: sign in again, then come straight back here.
        await signOutEverywhere("local").catch(() => {})
        window.location.replace("/login")
        return
      }
      throw error
    }
    // Everything was closed while asleep: start fresh.
    queryClient.clear()
    window.location.replace("/home")
  }

  const start = async () => {
    setError(undefined)
    setBusy(true)
    try {
      if (!telegram) return await wake(null)
      const res = await fetch("/api/auth/reactivate", { method: "POST" })
      if (res.status === 429) throw new Error(t("reset.tooMany"))
      const body = (await res.json()) as { sent?: boolean }
      if (!body.sent) throw new Error(t("common.error"))
      setStep("code")
    } catch (e) {
      setError((e as Error).message || t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!/^\d{6}$/.test(code) || !email) return setError(t("reset.codeInvalid"))
    setBusy(true)
    try {
      const { data: grant } = await getSupabaseBrowserClient()!.rpc("reset_verify_code", { p_email: email, p_code: code })
      if (!grant) throw new Error(t("reset.codeInvalid"))
      await wake(String(grant))
    } catch (err) {
      setError((err as Error).message || t("common.error"))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-5 py-12 text-center animate-in fade-in-0 duration-300">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <MoonIcon className="size-8" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t("dormant.title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("dormant.body")}</p>
      </div>

      {step === "start" ? (
        <Button className="h-12 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2Icon className="animate-spin" /> : telegram ? <SendIcon /> : null}
          {t(telegram ? "dormant.sendCode" : "dormant.reactivate")}
        </Button>
      ) : (
        <form onSubmit={verify} className="w-full space-y-3">
          <p className="text-sm text-muted-foreground">{t("dormant.codeSent")}</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className="h-12 text-center text-lg tracking-[0.5em] tabular-nums"
            aria-label={t("reset.codeLabel")}
            autoFocus
          />
          <Button type="submit" className="h-12 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("dormant.reactivate")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => void signOutEverywhere("local").then(() => window.location.replace("/login"))}
      >
        {t("settings.signOut")}
      </button>
    </div>
  )
}
