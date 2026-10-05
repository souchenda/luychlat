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
    <div className="min-h-dvh bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 md:bg-neutral-100 md:dark:bg-neutral-900">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-white dark:bg-neutral-950 md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[2rem] md:shadow-2xl md:ring-1 md:ring-black/5">
        {/* Hero: deep emerald with a slowly drifting light, a faint dot grid and a floating ៛. */}
        <header className="relative isolate overflow-hidden bg-linear-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 pt-6 pb-20 text-white dark:from-emerald-800 dark:via-emerald-900 dark:to-teal-950">
          <div aria-hidden className="pointer-events-none absolute -top-1/2 -left-1/3 -z-10 size-[160%] animate-aurora rounded-full bg-[radial-gradient(closest-side,rgba(167,243,208,0.32),transparent_70%)] motion-reduce:animate-none" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] bg-[size:18px_18px]" />
          <span aria-hidden className="pointer-events-none absolute -right-3 bottom-6 -z-10 animate-float text-[9.5rem] leading-none font-bold text-white/10 select-none motion-reduce:animate-none">
            ៛
          </span>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-10 rounded-xl bg-white text-lg text-emerald-700 shadow-lg shadow-black/15" />
              <span className="text-base font-semibold">{hydrated ? t("app.name") : "លុយឆ្លាត"}</span>
            </div>
            <LanguageToggle />
          </div>

          {hydrated && (
            <div key={t("login.title")} className="mt-10 space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
              <h1 className="text-3xl leading-snug font-semibold">{t("login.title")}</h1>
              <p className="max-w-xs text-sm leading-relaxed text-white/80">{t("login.subtitle")}</p>
            </div>
          )}
        </header>

        {/* The form rises over the hero like a sheet. */}
        <section className="relative -mt-8 flex flex-1 flex-col justify-between rounded-t-[28px] bg-white px-6 pt-7 pb-6 shadow-[0_-12px_30px_-14px_rgba(0,0,0,0.25)] animate-in fade-in-0 slide-in-from-bottom-6 duration-500 ease-out dark:bg-neutral-950 motion-reduce:animate-none">
          {hydrated && (
            <div className="flex flex-col gap-6">
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
          )}

          {hydrated && <LoginFooter />}
        </section>
      </main>
    </div>
  )
}
