"use client"

import { ArrowLeftIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, SendIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LoginIdentifier } from "@/lib/auth-identifier"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { MIN_PASSWORD, PasswordHint } from "./password-hint"

export type ResetStart = { id: LoginIdentifier; link: string | null; emailed: boolean }

/**
 * Forgot password, steps 2–3: the 6-digit code from Telegram (linked chat, or
 * the deep link where a phone account shares its number), then the new
 * password. The code is checked in the database (5 tries, 10 minutes) and
 * unlocks a short grant; the new password signs the account out everywhere.
 */
export function TelegramReset({ start, onBack, onDone, field, label }: { start: ResetStart; onBack: () => void; onDone: () => void; field: string; label: string }) {
  const t = useT()
  const [step, setStep] = useState<"code" | "password">("code")
  const [code, setCode] = useState("")
  const [grant, setGrant] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!/^\d{6}$/.test(code)) return setError(t("reset.codeInvalid"))
    setBusy(true)
    const { data, error } = await getSupabaseBrowserClient()!.rpc("reset_verify_code", { p_email: start.id.email, p_code: code })
    setBusy(false)
    if (error || !data) return setError(t("reset.codeInvalid"))
    setGrant(String(data))
    setStep("password")
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (password.length < MIN_PASSWORD) return setError(t("login.passwordShort", { min: MIN_PASSWORD }))
    setBusy(true)
    const { error } = await getSupabaseBrowserClient()!.rpc("reset_set_password", { p_grant: grant, p_password: password })
    setBusy(false)
    if (error) return setError(t(/invalid_grant/.test(error.message) ? "reset.grantExpired" : "common.error"))
    onDone()
  }

  const primary = "h-12 w-full rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-200">
      <button type="button" className="-ml-1 flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100" onClick={onBack}>
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("login.backToSignIn")}
      </button>

      {step === "code" ? (
        <form onSubmit={verify} className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">{t("reset.codeTitle")}</p>
            <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{t("reset.codeSent")}</p>
            {start.emailed && <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{t("reset.alsoEmailed")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-code" className={label}>
              {t("reset.codeLabel")}
            </Label>
            <Input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className={cn(field, "text-center text-lg tracking-[0.5em] tabular-nums")}
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" className={primary} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("reset.verify")}
          </Button>
          {start.link && (
            <div className="space-y-2 rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
              <p className="text-xs leading-relaxed text-sky-900 dark:text-sky-200">{t("reset.notLinked")}</p>
              <Button asChild variant="outline" className="h-11 w-full rounded-xl border-sky-200 bg-white text-sm text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:bg-transparent dark:text-sky-300">
                <a href={start.link} target="_blank" rel="noopener noreferrer">
                  <SendIcon className="size-4" aria-hidden />
                  {t("reset.openTelegram")}
                </a>
              </Button>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <KeyRoundIcon className="size-5 text-emerald-600" aria-hidden />
              {t("reset.newPasswordTitle")}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("reset.newPasswordHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-password" className={label}>
              {t("login.password")}
            </Label>
            <div className="relative">
              <Input
                id="reset-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(field, "pr-11")}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400"
                aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
              >
                {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            <PasswordHint password={password} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" className={primary} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("reset.save")}
          </Button>
        </form>
      )}
    </div>
  )
}
