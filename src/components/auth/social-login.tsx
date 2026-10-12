"use client"

import type { Provider } from "@supabase/supabase-js"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BiometricIcon } from "@/components/lock/biometric-icon"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { passkeySupported, signInWithPasskey } from "@/lib/auth/passkey"
import { useT } from "@/lib/i18n/use-t"
import { detectBiometricKind } from "@/lib/security/biometric"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { authMethods } from "@/lib/supabase/config"
import { parseTgAuthResult, telegramAuthUrl } from "@/lib/telegram-auth-result"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.34z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.1H3.08v2.58A9.99 9.99 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.31.31-1.92V7.5H3.08A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.08 4.5l3.33-2.58z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.95 2.99 14.7 2 12 2a9.99 9.99 0 0 0-8.92 5.5l3.33 2.58C7.2 7.73 9.4 5.98 12 5.98z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.59.68-1.1 1.77-.96 2.81 1.01.08 2.05-.52 2.69-1.29z" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M21.94 4.6 18.9 19.04c-.23 1.02-.83 1.27-1.69.79l-4.66-3.43-2.25 2.16c-.25.25-.46.46-.94.46l.33-4.74 8.63-7.8c.38-.33-.08-.52-.58-.19l-10.67 6.72-4.6-1.44c-1-.31-1.02-1 .21-1.48l17.98-6.93c.83-.31 1.56.19 1.29 1.44z" />
    </svg>
  )
}

/** The signed data back from Telegram → a session (cookies set by the server) → /home. */
async function finishTelegram(user: Record<string, string | number>): Promise<"ok" | "not_linked" | "error"> {
  const res = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(user) }).catch(() => null)
  const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null
  return json?.ok ? "ok" : json?.error === "not_linked" ? "not_linked" : "error"
}

/**
 * Back from Telegram's sign-in page (#tgAuthResult=… on /login): finishes the sign-in. Rendered on
 * the login page whatever the tab; the hash is removed at once so a reload never resends it.
 */
export function TelegramReturn() {
  const t = useT()
  useEffect(() => {
    const user = parseTgAuthResult(window.location.hash)
    if (!window.location.hash.includes("tgAuthResult")) return
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    if (!user) return void toast.error(t("login.telegramError"))
    const id = toast.loading(t("login.telegramSignIn"))
    void finishTelegram(user).then((r) => {
      toast.dismiss(id)
      if (r === "ok") return window.location.assign("/home")
      toast.error(t(r === "not_linked" ? "login.telegramNotLinked" : "login.telegramError"))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])
  return null
}

/**
 * Google (when switched on in Supabase) and Telegram (when the server has it on: /api/auth/telegram)
 * above the forms, on both tabs, with the «ឬប្រើប្រាស់លេខទូរស័ព្ទ / អ៊ីមែល» line under them. Nothing
 * at all when neither is available.
 */
export function SocialLogin({ disabled, separator = true, below = false }: { disabled?: boolean; separator?: boolean; below?: boolean }) {
  const t = useT()
  const [tgBusy, setTgBusy] = useState(false)
  const telegram = useQuery({
    queryKey: ["auth-telegram"],
    staleTime: 10 * 60_000,
    queryFn: async () => ((await fetch("/api/auth/telegram").then((r) => r.json()).catch(() => null)) as { enabled?: boolean; botId?: string } | null) ?? { enabled: false },
  })
  const tgBot = telegram.data?.enabled ? telegram.data.botId : null
  const google = authMethods.has("google")
  const apple = authMethods.has("apple")
  // Face ID / fingerprint: only where the device has it and the server verifies passkeys.
  const passkey = useQuery({ queryKey: ["auth-passkey"], staleTime: 10 * 60_000, queryFn: passkeySupported }).data === true
  const [pkBusy, setPkBusy] = useState(false)
  if (!google && !apple && !tgBot && !passkey) return null

  const signInPasskey = async () => {
    setPkBusy(true)
    const r = await signInWithPasskey()
    if (r === "ok") return window.location.assign("/home")
    setPkBusy(false)
    if (r === "unknown") toast.error(t("passkey.unknown"))
    else if (r === "failed") toast.error(t("passkey.failed"))
  }

  // A full-page redirect to Telegram and back (#tgAuthResult) — a popup fails on phones (a new tab,
  // then the Telegram app) and in the installed app's WebView.
  const signInTelegram = () => {
    if (!tgBot) return
    setTgBusy(true)
    window.location.assign(telegramAuthUrl(tgBot, window.location.origin, `${window.location.origin}/login`))
  }

  const signIn = async (provider: Provider) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    if (error) toast.error(t("login.oauthError"))
  }

  const line = (label: string) => (
    <div className="flex items-center gap-3 text-xs text-neutral-400">
      <Separator className="flex-1" />
      {label}
      <Separator className="flex-1" />
    </div>
  )
  const size = below ? "h-11 text-sm" : "h-12 text-base"

  return (
    <div className={below ? "grid gap-2.5 pt-0.5" : "grid gap-2.5"}>
      {below && line(t("login.or"))}
      {passkey && (
        <Button
          type="button"
          className={`${size} rounded-xl border border-emerald-600/25 bg-emerald-600/10 font-semibold text-emerald-800 shadow-none transition-all hover:bg-emerald-600/15 active:scale-[0.98] dark:text-emerald-300`}
          onClick={() => void signInPasskey()}
          disabled={disabled || pkBusy}
        >
          {pkBusy ? <Loader2Icon className="animate-spin" /> : <BiometricIcon kind={detectBiometricKind()} />}
          {t("passkey.signIn")}
        </Button>
      )}
      {google && (
        <Button
          type="button"
          variant="outline"
          className={`${size} rounded-xl border border-neutral-200 bg-white font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-white dark:text-neutral-800 dark:hover:bg-neutral-100`}
          onClick={() => void signIn("google")}
          disabled={disabled}
        >
          <GoogleIcon />
          {t("login.google")}
        </Button>
      )}
      {tgBot && (
        <Button
          type="button"
          className={`${size} rounded-xl border border-[#229ED9]/25 bg-[#229ED9]/10 font-semibold text-[#1a7fb0] shadow-none transition-all hover:bg-[#229ED9]/15 active:scale-[0.98] dark:text-[#5bbfe8]`}
          onClick={signInTelegram}
          disabled={disabled || tgBusy}
        >
          {tgBusy ? <Loader2Icon className="animate-spin" /> : <TelegramIcon />}
          {t("login.telegramSignIn")}
        </Button>
      )}
      {apple && (
        <Button type="button" variant="outline" className={`${size} rounded-xl font-semibold shadow-sm`} onClick={() => void signIn("apple")} disabled={disabled}>
          <AppleIcon />
          {t("login.apple")}
        </Button>
      )}
      {separator && !below && line(t("login.orPhoneEmail"))}
    </div>
  )
}
