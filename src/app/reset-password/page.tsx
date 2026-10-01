"use client"

import { EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { authErrorCode } from "@/components/auth/email-login"
import { MIN_STRENGTH, PasswordStrength, passwordStrength } from "@/components/auth/password-strength"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useHydrated } from "@/hooks/use-hydrated"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Target of the "reset password" email: /auth/callback has already signed the
 * user in from the link, so here they only choose the new password.
 */
export default function ResetPasswordPage() {
  const t = useT()
  const router = useRouter()
  const hydrated = useHydrated()
  const { user, authReady } = useSessionStore()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (passwordStrength(password, user?.email ?? "") < MIN_STRENGTH) return setError(t("pw.chooseStronger"))
    if (password !== confirm) return setError(t("pw.mismatch"))
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      const code = authErrorCode(error)
      return setError(
        code === "same_password"
          ? t("pw.same")
          : code === "weak_password"
            ? t("pw.chooseStronger")
            : `${t("pw.saveFailed")} (${code || error.status}: ${error.message})`,
      )
    }
    toast.success(t("pw.saved"))
    router.replace("/home")
  }

  return (
    <main className="app-frame flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-8">
      <BrandMark className="mx-auto size-12 text-2xl" />
      {!hydrated || !authReady ? (
        <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
      ) : !user ? (
        // The link expired, was already used, or was opened without signing in.
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <p className="font-semibold">{t("pw.linkExpired")}</p>
          <p className="text-sm text-muted-foreground">{t("pw.linkExpiredHint")}</p>
          <Button onClick={() => router.replace("/login")}>{t("login.backToSignIn")}</Button>
        </Card>
      ) : (
        <Card className="gap-4 px-5 py-6">
          <div className="space-y-1 text-center">
            <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
              <KeyRoundIcon className="size-5" aria-hidden />
              {t("pw.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("pw.new")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-11 text-base"
                  autoFocus
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
              <PasswordStrength password={password} email={user.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("pw.confirm")}</Label>
              <Input
                id="confirm-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy || !password}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t("pw.save")}
            </Button>
          </form>
        </Card>
      )}
    </main>
  )
}
