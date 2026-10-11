"use client"

import { BriefcaseBusinessIcon, LockKeyholeIcon, ReceiptTextIcon, ScanLineIcon, ShieldCheckIcon } from "lucide-react"
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
import { misansKhmer } from "@/lib/fonts/misans-khmer"
import { hasGuestData } from "@/lib/data/guest-import"
import { useT } from "@/lib/i18n/use-t"
import { authMethods, isSupabaseConfigured } from "@/lib/supabase/config"
import { useSessionStore } from "@/stores/session-store"

const FEATURES = [
  { key: "login.featureScan", icon: ScanLineIcon },
  { key: "login.featureDebts", icon: ReceiptTextIcon },
  { key: "login.featureWorkspaces", icon: BriefcaseBusinessIcon },
] as const

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

/** Signed out because the account signed in on another device. */
/** After deleting the account. (Signed out by the one-device rule: a one-line note inside the sign-in form.) */
function AccountDeletedNote() {
  const t = useT()
  const params = useSearchParams()
  if (params.get("deleted") !== "1") return null
  return <p className="rounded-xl bg-neutral-100 p-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{t("deleteAccount.done")}</p>
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
      {/* Tech background: a faint dot matrix fading out downwards, and three emerald / cyan orbs that breathe
          and drift (transform + opacity only, composited on the GPU; still with reduced motion). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.13)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_40%,transparent_100%)] dark:bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)]" />
        <div className="absolute -top-48 left-1/2 -ml-[20rem] size-[40rem] animate-breathe rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.24),transparent)] will-change-transform motion-reduce:animate-none dark:bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent)]" />
        <div className="absolute top-1/4 -left-40 size-[26rem] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.16),transparent)] will-change-transform motion-reduce:animate-none" />
        <div className="absolute -right-40 bottom-8 size-[28rem] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(20,184,166,0.16),transparent)] will-change-transform [animation-delay:-4.5s] motion-reduce:animate-none" />
      </div>

      <main
        className={`${misansKhmer.variable} mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-3 pb-2`}
        style={{ fontFamily: "var(--font-misans-khmer), var(--font-kantumruy), sans-serif" }}
      >
        <div className="flex justify-end">
          <LanguageToggle />
        </div>

        {/* Brand: logo, then title, then the card — each a beat after the last. */}
        <div className="mb-3 flex flex-col items-center text-center">
          <BrandMark className="size-16 rounded-[1.35rem] bg-linear-to-br from-emerald-500 to-teal-600 text-3xl text-white shadow-lg shadow-emerald-600/30 ring-1 ring-white/40 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none dark:ring-white/10" />
          <h1 className="mt-3 text-2xl font-bold delay-75 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">{hydrated ? t("app.name") : "អេប លុយឆ្លាត"}</h1>
          <p className="mt-0.5 text-sm text-neutral-500 delay-75 dark:text-neutral-400 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">{hydrated && t("app.tagline")}</p>
        </div>

        {hydrated && (
          <section className="rounded-3xl border border-white/60 bg-white/85 px-5 py-5 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl delay-150 dark:border-emerald-500/20 dark:bg-zinc-900/85 dark:shadow-black/30 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">
            <div className="flex flex-col gap-3">
              {/* Trust line at the top of the card. */}
              <p className="mx-auto flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1 text-center text-[11px] leading-snug font-medium text-emerald-800 dark:text-emerald-300">
                <LockKeyholeIcon className="size-3.5 shrink-0" aria-hidden />
                {t("login.trust")}
              </p>
              <h2 className="text-base font-semibold">{t("login.title")}</h2>

              {cloudDisabled && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  {t("login.supabaseMissing")}
                </p>
              )}
              <Suspense>
                <OAuthError />
                <AccountDeletedNote />
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
                      {t("login.orPhoneEmail")}
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

              {/* The guarantee, under the button. */}
              <p className="flex items-start justify-center gap-1.5 border-t border-neutral-100 pt-3 text-center text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t("login.guarantee")}
              </p>
            </div>
          </section>
        )}

        {/* What the app does, in three short lines. */}
        {hydrated && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2 delay-200 animate-in fade-in-0 slide-in-from-bottom-3 duration-350 ease-out fill-mode-both motion-reduce:animate-none">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li key={key} className="flex cursor-default items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/70 px-3 py-1 text-xs text-neutral-600 backdrop-blur-sm transition-all duration-200 select-none hover:-translate-y-0.5 hover:border-emerald-500/30 hover:bg-white hover:shadow-md hover:shadow-emerald-500/10 active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-900">
                <Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto">{hydrated && <LoginFooter />}</div>
      </main>
    </div>
  )
}
