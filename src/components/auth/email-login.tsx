"use client"

import { EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, MailIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

import { MIN_PASSWORD, MIN_STRENGTH, PasswordStrength, passwordStrength } from "./password-strength"

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Supabase error code, if any (older errors only have a message). */
export const authErrorCode = (error: { message: string; status?: number }) =>
  "code" in error ? String((error as { code?: string }).code ?? "") : ""

/**
 * Email + password through Supabase Auth's built-in email provider: no SMS
 * provider (Twilio etc.) needed. A new account gets the usual Personal and
 * Business workspaces from the signup trigger.
 */
export function EmailLogin({ disabled, initialEmail = "" }: { disabled?: boolean; initialEmail?: string }) {
  const t = useT()
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin")
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const switchMode = (next: typeof mode) => {
    setMode(next)
    setError(undefined)
    setNotice(undefined)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    setNotice(undefined)
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setError(t("login.emailInvalid"))
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    if (mode === "forgot") {
      setBusy(true)
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      setBusy(false)
      // Same answer whether or not the address has an account (no account probing).
      if (error && authErrorCode(error) !== "user_not_found") {
        return setError(`${t("login.resetFailed")} (${authErrorCode(error) || error.status}: ${error.message})`)
      }
      setNotice(t("login.resetSent", { email: address }))
      return
    }

    if (password.length < MIN_PASSWORD) return setError(t("login.passwordShort", { min: MIN_PASSWORD }))
    setBusy(true)
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password })
      setBusy(false)
      // On success the AuthListener picks up the session and the login page redirects.
      if (error) {
        const code = authErrorCode(error)
        if (code === "invalid_credentials") return setError(t("login.emailError"))
        if (code === "email_not_confirmed" || /confirm/i.test(error.message)) return setError(t("login.emailUnconfirmed"))
        // Anything else is a setup or network problem: show Supabase's reason.
        setError(`${t("login.signinFailed")} (${code || error.status || "error"}: ${error.message})`)
      }
      return
    }

    if (passwordStrength(password, address) < MIN_STRENGTH) {
      setBusy(false)
      return setError(t("pw.chooseStronger"))
    }
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    setBusy(false)
    if (error) {
      const code = authErrorCode(error)
      if (code === "user_already_exists" || /registered|exists/i.test(error.message)) return setError(t("login.emailTaken"))
      if (code === "weak_password") return setError(t("pw.chooseStronger"))
      return setError(`${t("login.signupError")} (${code || error.status}: ${error.message})`)
    }
    // With "Confirm email" on, Supabase sends a link and there is no session yet.
    if (!data.session) {
      setNotice(t("login.checkEmail", { email: address }))
      setMode("signin")
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "forgot" ? (
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRoundIcon className="size-4" aria-hidden />
            {t("login.forgotTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("login.forgotHint")}</p>
        </div>
      ) : (
        <Segmented
          aria-label={t("login.emailTitle")}
          value={mode}
          onChange={switchMode}
          options={[
            { value: "signin", label: t("login.signIn") },
            { value: "signup", label: t("login.signUp") },
          ]}
        />
      )}
      <div className="space-y-2">
        <Label htmlFor="login-email">{t("login.email")}</Label>
        <Input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="h-12 text-base"
          disabled={disabled}
        />
      </div>
      {mode !== "forgot" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">{t("login.password")}</Label>
            {mode === "signin" && (
              <button type="button" className="text-xs text-primary" onClick={() => switchMode("forgot")}>
                {t("login.forgot")}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pr-11 text-base"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
              aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
            >
              {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          {mode === "signup" && <PasswordStrength password={password} email={email} />}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={disabled || busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : mode === "forgot" ? <KeyRoundIcon /> : <MailIcon />}
        {mode === "forgot" ? t("login.sendReset") : mode === "signin" ? t("login.signIn") : t("login.signUp")}
      </Button>
      {mode === "forgot" && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode("signin")}>
          {t("login.backToSignIn")}
        </Button>
      )}
    </form>
  )
}
