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
    // Full-bleed, plain white (no card): a native mobile screen, centred on wide screens.
    <div className="min-h-dvh bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-10">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandMark className="size-8 rounded-[10px] bg-emerald-600 text-base text-white shadow-none" />
              <span className="text-base font-semibold">{hydrated ? t("app.name") : "លុយឆ្លាត"}</span>
            </div>
            <LanguageToggle />
          </div>

          {hydrated && (
            <div className="mt-12 flex flex-col gap-6 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
              <div className="space-y-1.5">
                <h1 className="text-2xl leading-snug font-semibold">{t("login.title")}</h1>
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
          )}
        </div>

        {hydrated && <LoginFooter />}
      </main>
    </div>
  )
}
