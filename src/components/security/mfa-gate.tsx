"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, LogOutIcon, ShieldCheckIcon } from "lucide-react"
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
  if (!needsCode) return <>{children}</>

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
