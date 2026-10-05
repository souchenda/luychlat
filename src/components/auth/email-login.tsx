"use client"

import { EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, LockKeyholeIcon, MailIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { MIN_PASSWORD, PasswordHint } from "./password-hint"

/** Sign in / Create account, with the white pill sliding under the active tab. */
function AuthTabs({ value, onChange, label }: { value: "signin" | "signup"; onChange: (v: "signin" | "signup") => void; label: string }) {
  const t = useT()
  const tabs = [
    { value: "signin" as const, label: t("login.signIn") },
    { value: "signup" as const, label: t("login.signUp") },
  ]
  return (
    <div role="radiogroup" aria-label={label} className="relative grid grid-cols-2 rounded-2xl bg-muted/70 p-1 dark:bg-neutral-800/70">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-background shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none",
          value === "signup" && "translate-x-full",
        )}
      />
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="radio"
          aria-checked={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "relative z-10 rounded-xl py-2.5 text-sm transition-colors duration-300",
            value === tab.value ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

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
  const [shaking, setShaking] = useState(false)
  /** Shows the error and gives the form a short shake. */
  const fail = (message: string) => {
    setError(message)
    setShaking(true)
  }

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
    if (!EMAIL.test(address)) return fail(t("login.emailInvalid"))
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
        return fail(`${t("login.resetFailed")} (${authErrorCode(error) || error.status}: ${error.message})`)
      }
      setNotice(t("login.resetSent", { email: address }))
      return
    }

    if (password.length < MIN_PASSWORD) return fail(t("login.passwordShort", { min: MIN_PASSWORD }))
    setBusy(true)
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password })
      setBusy(false)
      // On success the AuthListener picks up the session and the login page redirects.
      if (error) {
        const code = authErrorCode(error)
        if (code === "invalid_credentials") return fail(t("login.emailError"))
        if (code === "email_not_confirmed" || /confirm/i.test(error.message)) return fail(t("login.emailUnconfirmed"))
        // Anything else is a setup or network problem: show Supabase's reason.
        fail(`${t("login.signinFailed")} (${code || error.status || "error"}: ${error.message})`)
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
      if (code === "user_already_exists" || /registered|exists/i.test(error.message)) return fail(t("login.emailTaken"))
      if (code === "weak_password") return fail(t("pw.chooseStronger"))
      return fail(`${t("login.signupError")} (${code || error.status}: ${error.message})`)
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
    <form onSubmit={submit} className={cn("space-y-3", shaking && "animate-shake motion-reduce:animate-none")} onAnimationEnd={() => setShaking(false)}>
      {mode === "forgot" ? (
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRoundIcon className="size-4" aria-hidden />
            {t("login.forgotTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("login.forgotHint")}</p>
        </div>
      ) : (
        <AuthTabs value={mode} onChange={switchMode} label={t("login.emailTitle")} />
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
      {error && <p role="alert" className="text-sm text-destructive animate-in fade-in-0 duration-200">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <Button
        type="submit"
        className="h-12 w-full rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 text-base font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-60"
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
