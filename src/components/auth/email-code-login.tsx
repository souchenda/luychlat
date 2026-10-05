"use client"

import { ArrowLeftIcon, Loader2Icon, MailIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { claimSingleSession } from "@/lib/auth/single-session"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

import { authErrorCode, EMAIL } from "./email-login"

const RESEND_SECONDS = 60
// Supabase's "Email OTP length" setting is 6 by default and may be up to 10.
const MIN_CODE = 6
const MAX_CODE = 10

/**
 * Passwordless: Supabase emails a one-time code; entering it signs in, and
 * creates the account on first use. Needs a real email provider (custom SMTP)
 * and the code ({{ .Token }}) in the "Magic link" and "Confirm signup" emails.
 */
export function EmailCodeLogin({ disabled }: { disabled?: boolean }) {
  const t = useT()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const address = email.trim().toLowerCase()

  const send = async () => {
    setError(undefined)
    if (!EMAIL.test(address)) return setError(t("login.emailInvalid"))
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    setBusy(false)
    if (error) {
      const code = authErrorCode(error)
      return setError(
        code === "over_email_send_rate_limit" || error.status === 429
          ? t("login.codeRateLimited")
          : `${t("login.codeSendFailed")} (${code || error.status}: ${error.message})`,
      )
    }
    setStep("code")
    setCode("")
    setResendIn(RESEND_SECONDS)
  }

  const verify = async (value = code) => {
    if (value.length < MIN_CODE) return
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    setError(undefined)
    const { error } = await supabase.auth.verifyOtp({ email: address, token: value, type: "email" })
    if (!error) await claimSingleSession(supabase)
    setBusy(false)
    // On success the AuthListener picks up the session and the login page redirects.
    if (error) {
      setError(t("login.otpError"))
      setCode("")
    }
  }

  if (step === "code") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setStep("email")
            setError(undefined)
          }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {t("login.changeEmail")}
        </button>
        <div className="space-y-1">
          <p className="font-semibold">{t("login.otpTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("login.codeSentTo", { email: address })}</p>
        </div>
        <Input
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, MAX_CODE)
            setCode(digits)
            setError(undefined)
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••••"
          aria-label={t("login.otpTitle")}
          className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
          disabled={busy}
        />
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Button className="h-12 w-full text-base" onClick={() => verify()} disabled={busy || code.length < MIN_CODE}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("login.verify")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={send} disabled={busy || resendIn > 0}>
          {resendIn > 0 ? t("login.resendIn", { seconds: resendIn }) : t("login.resend")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("login.codeSpamHint")}</p>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="space-y-1">
        <p className="font-semibold">{t("login.codeTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("login.codeHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="code-email">{t("login.email")}</Label>
        <Input
          id="code-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(undefined)
          }}
          placeholder="name@example.com"
          className="h-12 text-base"
          disabled={disabled || busy}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={disabled || busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
        {t("login.sendEmailCode")}
      </Button>
    </form>
  )
}
