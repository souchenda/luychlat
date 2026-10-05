"use client"

import { EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, LockKeyholeIcon, MailIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

import { MIN_PASSWORD, PasswordHint } from "./password-hint"

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
    // Normally (Supabase "Confirm email" off) signUp returns a session: the
    // AuthListener signs the user in and the login page goes to /home at once.
    // If confirmation is still on in Supabase, there is no session yet.
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
          className="rounded-2xl bg-muted/70 p-1 dark:bg-neutral-800/70 [&>button]:rounded-xl [&>button]:py-2.5 [&>button[aria-checked=true]]:font-semibold [&>button[aria-checked=true]]:text-emerald-700 [&>button[aria-checked=true]]:shadow-md dark:[&>button[aria-checked=true]]:text-emerald-400"
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
        <div className="relative">
          <MailIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-12 rounded-xl pl-10 text-base focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
            disabled={disabled}
          />
        </div>
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
            <LockKeyholeIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl pl-10 text-base focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 pr-11"
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
          {mode === "signup" && <PasswordHint password={password} />}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <Button
        type="submit"
        className="h-12 w-full rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 text-base font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] disabled:opacity-60"
        disabled={disabled || busy}
      >
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
