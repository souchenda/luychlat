"use client"

import { EyeIcon, EyeOffIcon, Loader2Icon, MailIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const MIN_PASSWORD = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Email + password through Supabase Auth's built-in email provider: no SMS
 * provider (Twilio etc.) needed. A new account gets the usual Personal and
 * Business workspaces from the signup trigger.
 */
export function EmailLogin({ disabled }: { disabled?: boolean }) {
  const t = useT()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    setNotice(undefined)
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setError(t("login.emailInvalid"))
    if (password.length < MIN_PASSWORD) return setError(t("login.passwordShort", { min: MIN_PASSWORD }))
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setBusy(true)
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password })
      setBusy(false)
      // On success the AuthListener picks up the session and the login page redirects.
      if (error) setError(/confirm/i.test(error.message) ? t("login.emailUnconfirmed") : t("login.emailError"))
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    setBusy(false)
    if (error) return setError(/registered|exists/i.test(error.message) ? t("login.emailTaken") : t("login.signupError"))
    // With "Confirm email" on, Supabase sends a link and there is no session yet.
    if (!data.session) {
      setNotice(t("login.checkEmail", { email: address }))
      setMode("signin")
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Segmented
        aria-label={t("login.emailTitle")}
        value={mode}
        onChange={(m) => {
          setMode(m)
          setError(undefined)
        }}
        options={[
          { value: "signin", label: t("login.signIn") },
          { value: "signup", label: t("login.signUp") },
        ]}
      />
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
      <div className="space-y-2">
        <Label htmlFor="login-password">{t("login.password")}</Label>
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
        {mode === "signup" && <p className="text-xs text-muted-foreground">{t("login.passwordHint", { min: MIN_PASSWORD })}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={disabled || busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
        {mode === "signin" ? t("login.signIn") : t("login.signUp")}
      </Button>
    </form>
  )
}
