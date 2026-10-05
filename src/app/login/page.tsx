"use client"

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
    <div className="relative isolate min-h-dvh overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* A soft ambient glow at the top centre, drifting very slowly. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden">
        <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.20),transparent)] dark:bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent)]" />
        <div className="absolute -top-24 left-1/2 size-[22rem] animate-aurora rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.16),transparent)] motion-reduce:animate-none" />
      </div>

      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-5 pb-6">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>

        {/* Brand: logo, then title, then the card — each a beat after the last. */}
        <div className="mt-6 mb-7 flex flex-col items-center text-center">
          <BrandMark className="size-16 rounded-[1.25rem] bg-linear-to-br from-emerald-500 to-teal-600 text-3xl text-white shadow-lg shadow-emerald-600/30 ring-1 ring-white/40 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none dark:ring-white/10" />
          <h1 className="mt-4 text-2xl font-semibold delay-75 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">{hydrated ? t("app.name") : "លុយឆ្លាត"}</h1>
          <p className="mt-1 text-sm text-neutral-500 delay-75 dark:text-neutral-400 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">{hydrated && t("app.tagline")}</p>
        </div>

        {hydrated && (
          <section className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xl shadow-emerald-950/5 delay-150 dark:border-neutral-800 dark:bg-neutral-900/80 dark:shadow-black/30 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">
            <div className="flex flex-col gap-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t("login.title")}</h2>
                <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{t("login.subtitle")}</p>
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
                    <div className="flex items-center gap-3 text-xs text-neutral-400">
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
                    <div className="flex items-center gap-3 text-xs text-neutral-400">
                      <Separator className="flex-1" />
                      {t("login.orPhone")}
                      <Separator className="flex-1" />
                    </div>
                  )}
                  <PhoneLogin disabled={cloudDisabled} />
                </>
              )}
            </div>
          </section>
        )}

        <div className="mt-auto">{hydrated && <LoginFooter />}</div>
      </main>
    </div>
  )
}
