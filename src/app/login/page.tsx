"use client"

import { CloudIcon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { EmailCodeLogin } from "@/components/auth/email-code-login"
import { LoginFooter } from "@/components/auth/login-footer"
import { EmailLogin } from "@/components/auth/email-login"
import { PhoneLogin } from "@/components/auth/phone-login"
import { SocialLogin } from "@/components/auth/social-login"
import { ReferralCapture } from "@/components/billing/referral"
import { BrandMark } from "@/components/brand-mark"
import { useGuestSummary } from "@/components/settings/guest-import"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { Separator } from "@/components/ui/separator"
import { useHydrated } from "@/hooks/use-hydrated"
import { hasGuestData } from "@/lib/data/guest-import"
import { useT } from "@/lib/i18n/use-t"
import { authMethods, isSupabaseConfigured } from "@/lib/supabase/config"
import { useSessionStore } from "@/stores/session-store"

/** Reassures a former guest that their device data will be offered for import. */
function GuestDataNote() {
  const t = useT()
  const summary = useGuestSummary()
  if (!hasGuestData(summary)) return null
  return (
    <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
      {t("login.guestDataKept", { wallets: summary.wallets, transactions: summary.transactions })}
    </p>
  )
}

function OAuthError() {
  const t = useT()
  const params = useSearchParams()
  const error = params.get("error")
  if (error !== "oauth" && error !== "link") return null
  return (
    <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      {t(error === "link" ? "login.linkError" : "login.oauthError")}
    </p>
  )
}

/** Three facts about how the data is kept (all true of the live setup: Supabase, TLS + AES-256 at rest, RLS). */
function TrustBadges() {
  const t = useT()
  const badges = [
    { icon: ShieldCheckIcon, title: t("login.badgeEncryption"), hint: t("login.badgeEncryptionHint") },
    { icon: LockKeyholeIcon, title: t("login.badgeRls"), hint: t("login.badgeRlsHint") },
    { icon: CloudIcon, title: t("login.badgeSync"), hint: t("login.badgeSyncHint") },
  ]
  return (
    <ul className="grid grid-cols-3 gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
      {badges.map(({ icon: Icon, title, hint }) => (
        <li key={title} className="flex flex-col items-center gap-1 text-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="text-[11px] leading-tight font-semibold">{title}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
        </li>
      ))}
    </ul>
  )
}

export default function LoginPage() {
  const t = useT()
  const router = useRouter()
  const hydrated = useHydrated()
  const user = useSessionStore((s) => s.user)

  useEffect(() => {
    if (user) router.replace("/home")
  }, [user, router])

  const cloudDisabled = !isSupabaseConfigured
  // With email codes on, they're the main way in; the password form is one tap away.
  const [usePassword, setUsePassword] = useState(false)
  const codeFirst = authMethods.has("email_code")
  const showPassword = authMethods.has("email") && (!codeFirst || usePassword)

  return (
    <main className="app-frame relative isolate flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-4 pt-6 sm:px-6">
      {/* Soft emerald / mint glow behind the header. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96">
        <div className="absolute inset-0 bg-linear-to-b from-emerald-50/80 to-transparent dark:from-emerald-950/40" />
        <div className="absolute top-[-6rem] left-1/2 size-[26rem] -translate-x-1/2 rounded-full bg-emerald-400/25 blur-3xl dark:bg-emerald-500/15" />
        <div className="absolute top-8 left-[15%] size-56 rounded-full bg-teal-300/25 blur-3xl dark:bg-teal-500/10" />
        <div className="absolute top-4 right-[10%] size-48 rounded-full bg-lime-200/30 blur-3xl dark:bg-emerald-300/10" />
      </div>

      <div className="flex justify-end">
        <LanguageToggle />
      </div>

      <div className="mt-4 mb-6 flex flex-col items-center gap-3 text-center animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">
        <BrandMark className="size-16 rounded-[1.25rem] bg-linear-to-br from-emerald-500 to-teal-600 text-3xl text-white shadow-lg shadow-emerald-600/30 ring-1 ring-white/30 dark:shadow-emerald-500/20" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{hydrated ? t("app.name") : "លុយឆ្លាត"}</h1>
          <p className="text-sm text-muted-foreground">{hydrated && t("app.tagline")}</p>
        </div>
      </div>

      {hydrated && (
        <div className="flex flex-col gap-5 rounded-3xl border border-neutral-100 bg-card/95 p-5 shadow-2xl shadow-emerald-950/10 backdrop-blur delay-100 sm:p-6 dark:border-neutral-800 dark:bg-card/90 dark:shadow-black/50 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">
          <div className="text-center">
            <h2 className="text-lg font-semibold">{t("login.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </div>

          {cloudDisabled && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {t("login.supabaseMissing")}
            </p>
          )}
          <Suspense>
            <OAuthError />
            <ReferralCapture />
          </Suspense>
          <GuestDataNote />

          {/* Google first: one tap, no typing. Only methods enabled in Supabase are offered (NEXT_PUBLIC_AUTH_METHODS). */}
          {(authMethods.has("google") || authMethods.has("apple")) && (
            <>
              <SocialLogin disabled={cloudDisabled} />
              {(authMethods.has("email") || codeFirst || authMethods.has("phone")) && (
                <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Separator className="flex-1" />
                  {t("login.orEmail")}
                  <Separator className="flex-1" />
                </div>
              )}
            </>
          )}

          {codeFirst && !usePassword && <EmailCodeLogin disabled={cloudDisabled} />}
          {showPassword && <EmailLogin disabled={cloudDisabled} />}
          {codeFirst && authMethods.has("email") && (
            <button type="button" className="-mt-2 text-center text-sm text-primary" onClick={() => setUsePassword((v) => !v)}>
              {usePassword ? t("login.useCode") : t("login.usePassword")}
            </button>
          )}

          {authMethods.has("phone") && (
            <>
              {(authMethods.has("email") || codeFirst) && (
                <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Separator className="flex-1" />
                  {t("login.orPhone")}
                  <Separator className="flex-1" />
                </div>
              )}
              <PhoneLogin disabled={cloudDisabled} />
            </>
          )}

          <TrustBadges />
        </div>
      )}

      {hydrated && (
        <p className="mx-auto mt-4 rounded-2xl border border-emerald-500/20 delay-200 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none bg-emerald-500/5 px-3 py-1 text-center text-[11px] text-emerald-800 dark:text-emerald-300">
          {t("login.features")}
        </p>
      )}

      {hydrated && <LoginFooter />}
    </main>
  )
}
