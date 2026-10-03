"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BanIcon, Loader2Icon, LogOutIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useT } from "@/lib/i18n/use-t"
import { useMfaState, verifyCode } from "@/lib/mfa"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSupportContacts } from "@/lib/support"
import { useSessionStore } from "@/stores/session-store"

import { CodeInput } from "./code-input"
import { TwoFactorRow } from "./two-factor"

/** Once per session: record the sign-in (Telegram "new sign-in" alert, once per device session). */
function useNoteLogin(ready: boolean) {
  const userId = useSessionStore((s) => s.user?.id)
  useEffect(() => {
    if (!ready || !userId) return
    const key = `luychlat-login-noted-${userId}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {
      // Private mode: the database still records each session only once.
    }
    void getSupabaseBrowserClient()?.rpc("note_login")
  }, [ready, userId])
}

/**
 * Shows the 6-digit code screen when this account has 2FA and the session
 * hasn't passed it yet; the app (and its data) appear only after that.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { data, isLoading } = useMfaState()
  const contacts = useSupportContacts().data
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const needsCode = Boolean(data?.needsCode && data.factorId)
  useNoteLogin(!isLoading && !needsCode)

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!needsCode) return <AccountGate hasFactor={Boolean(data?.factorId)}>{children}</AccountGate>

  const submit = async (value: string) => {
    if (!data?.factorId || busy) return
    setBusy(true)
    setError(false)
    const ok = await verifyCode(data.factorId, value)
    setBusy(false)
    if (!ok) {
      setError(true)
      setCode("")
      return
    }
    // Everything fetched before the code was empty (the database hides it): load again.
    await queryClient.invalidateQueries()
  }

  return (
    <main className="app-frame flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <BrandMark className="size-14 text-2xl" />
      <div className="space-y-1">
        <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
          {t("mfa.challengeTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("mfa.challengeHint")}</p>
      </div>
      <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} />
      {error && <p className="text-sm text-destructive">{t("mfa.wrongCode")}</p>}
      <Button className="h-12 w-full max-w-xs text-base" onClick={() => submit(code)} disabled={busy || code.length !== 6}>
        {busy && <Loader2Icon className="animate-spin" />}
        {t("login.verify")}
      </Button>
      <p className="max-w-xs text-xs text-muted-foreground">
        {t("mfa.lostDevice")}{" "}
        {contacts?.telegram_url && (
          <a href={contacts.telegram_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
            {t("login.support")}
          </a>
        )}
      </p>
      <Button variant="ghost" size="sm" onClick={() => void signOutEverywhere().then(() => window.location.assign("/login"))}>
        <LogOutIcon />
        {t("mfa.signOut")}
      </Button>
    </main>
  )
}

type AccountStatus = { suspended: boolean; require_2fa: boolean }

/**
 * Admin account controls (see public.account_ok): a suspended account sees
 * only a notice; an account required to use 2FA sees only the 2FA set-up
 * until it is done. The database refuses their data either way.
 */
function AccountGate({ hasFactor, children }: { hasFactor: boolean; children: React.ReactNode }) {
  const t = useT()
  const queryClient = useQueryClient()
  const userId = useSessionStore((s) => s.user?.id)
  const { data, isLoading } = useQuery({
    queryKey: ["account-status", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("my_account_status")
      if (error) throw error
      return data as AccountStatus
    },
  })
  const blockedFor2fa = Boolean(data?.require_2fa && !hasFactor)

  // 2FA just set up: everything fetched before was refused, so load again.
  useEffect(() => {
    if (data?.require_2fa && hasFactor) void queryClient.invalidateQueries()
  }, [data?.require_2fa, hasFactor, queryClient])

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data?.suspended && !blockedFor2fa) return <>{children}</>

  const signOut = (
    <Button variant="ghost" size="sm" onClick={() => void signOutEverywhere().then(() => window.location.assign("/login"))}>
      <LogOutIcon />
      {t("mfa.signOut")}
    </Button>
  )
  return (
    <main className="app-frame flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <BrandMark className="size-14 text-2xl" />
      {data?.suspended ? (
        <div className="space-y-2">
          <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
            <BanIcon className="size-5 text-destructive" aria-hidden />
            {t("account.suspendedTitle")}
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">{t("account.suspendedHint")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
              <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
              {t("account.require2faTitle")}
            </h1>
            <p className="max-w-xs text-sm text-muted-foreground">{t("account.require2faHint")}</p>
          </div>
          <div className="w-full max-w-sm rounded-xl border text-left">
            <TwoFactorRow />
          </div>
        </>
      )}
      {signOut}
    </main>
  )
}
