"use client"

import { UserRoundIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

import { PhoneLogin } from "@/components/auth/phone-login"
import { SocialLogin } from "@/components/auth/social-login"
import { BrandMark } from "@/components/brand-mark"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useHydrated } from "@/hooks/use-hydrated"
import { useT } from "@/lib/i18n/use-t"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { useSessionStore } from "@/stores/session-store"

function OAuthError() {
  const t = useT()
  const params = useSearchParams()
  if (params.get("error") !== "oauth") return null
  return <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("login.oauthError")}</p>
}

export default function LoginPage() {
  const t = useT()
  const router = useRouter()
  const hydrated = useHydrated()
  const { user, isGuest, startGuest } = useSessionStore()

  useEffect(() => {
    if (user || isGuest) router.replace("/home")
  }, [user, isGuest, router])

  const cloudDisabled = !isSupabaseConfigured

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>

      <div className="mt-6 mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark className="size-16 text-3xl" />
        <div>
          <h1 className="text-2xl font-bold">{hydrated ? t("app.name") : "លុយឆ្លាត"}</h1>
          <p className="text-sm text-muted-foreground">{hydrated && t("app.tagline")}</p>
        </div>
      </div>

      {hydrated && (
        <div className="flex flex-1 flex-col gap-5">
          <div>
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
          </Suspense>

          <PhoneLogin disabled={cloudDisabled} />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            {t("login.or")}
            <Separator className="flex-1" />
          </div>

          <SocialLogin disabled={cloudDisabled} />

          <div className="mt-auto pt-6 text-center">
            <Button variant="secondary" className="h-12 w-full text-base" onClick={startGuest}>
              <UserRoundIcon />
              {t("login.guest")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("login.guestHint")}</p>
          </div>
        </div>
      )}
    </main>
  )
}
