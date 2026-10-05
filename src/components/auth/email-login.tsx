"use client"

import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon, MailCheckIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { MIN_PASSWORD, PasswordHint } from "./password-hint"

/** Sign in / Create account: an iOS-style segment, the white pill slides under the active tab. */
function AuthTabs({ value, onChange, label }: { value: "signin" | "signup"; onChange: (v: "signin" | "signup") => void; label: string }) {
  const t = useT()
  const tabs = [
    { value: "signin" as const, label: t("login.signIn") },
    { value: "signup" as const, label: t("login.signUp") },
  ]
  return (
    <div role="radiogroup" aria-label={label} className="relative grid h-10 grid-cols-2 rounded-xl bg-neutral-100 p-0.5 dark:bg-neutral-900">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[10px] bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-neutral-700 dark:ring-white/5",
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
            "relative z-10 rounded-[10px] text-sm font-medium transition-colors duration-200",
            value === tab.value ? "text-neutral-900 dark:text-white" : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
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
  /** Reset link sent: the address it went to (the form makes way for a confirmation). */
  const [sentTo, setSentTo] = useState<string>()
  /** Shows the error and gives the form a short shake. */
  const fail = (message: string) => {
    setError(message)
    setShaking(true)
  }

  const switchMode = (next: typeof mode) => {
    setMode(next)
    setError(undefined)
    setNotice(undefined)
    setSentTo(undefined)
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
      setSentTo(address)
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

  const field =
    "h-12 rounded-xl border-neutral-200 bg-neutral-50/50 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-900/50 dark:focus-visible:border-emerald-400 dark:focus-visible:bg-neutral-900"
  const label = "text-sm font-medium text-neutral-700 dark:text-neutral-300"

  if (mode === "forgot" && sentTo) {
    return (
      <div className="space-y-5 text-center animate-in fade-in-0 duration-300">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <MailCheckIcon className="size-5" aria-hidden />
        </span>
        <div className="space-y-2">
          <p className="text-base font-semibold">{t("login.resetSentTitle")}</p>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{t("login.resetSentDone")}</p>
          <p className="text-sm font-medium break-all">{sentTo}</p>
        </div>
        <Button type="button" className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-medium text-white transition-all hover:bg-emerald-700 active:scale-[0.99]" onClick={() => switchMode("signin")}>
          {t("login.backToSignIn")}
        </Button>
      </div>
    )
  }

  return (
    <form
      key={mode === "forgot" ? "forgot" : "auth"}
      onSubmit={submit}
      className={cn("space-y-4 animate-in fade-in-0 duration-200", shaking && "animate-shake motion-reduce:animate-none")}
      onAnimationEnd={() => setShaking(false)}
    >
      {mode === "forgot" ? (
        <div className="space-y-1.5">
          <button type="button" className="-ml-1 flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100" onClick={() => switchMode("signin")}>
            <ArrowLeftIcon className="size-4" aria-hidden />
            {t("login.backToSignIn")}
          </button>
          <p className="pt-2 text-lg font-semibold">{t("login.forgotTitle")}</p>
          <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{t("login.forgotHint")}</p>
        </div>
      ) : (
        <AuthTabs value={mode} onChange={switchMode} label={t("login.emailTitle")} />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="login-email" className={label}>
          {t("login.email")}
        </Label>
        <Input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className={field}
          disabled={disabled}
        />
      </div>
      {mode !== "forgot" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className={label}>
              {t("login.password")}
            </Label>
            {mode === "signin" && (
              <button type="button" className="text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300" onClick={() => switchMode("forgot")}>
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
              className={cn(field, "pr-11")}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
            >
              {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          {mode === "signup" && <PasswordHint password={password} />}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 animate-in fade-in-0 duration-200 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</p>}
      <Button
        type="submit"
        className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-700/30 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
        disabled={disabled || busy}
      >
        {busy && <Loader2Icon className="animate-spin" />}
        {mode === "forgot" ? t("login.sendReset") : mode === "signin" ? t("login.signIn") : t("login.signUp")}
      </Button>
    </form>
  )
}
