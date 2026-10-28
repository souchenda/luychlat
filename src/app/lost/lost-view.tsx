"use client"

import { LogInIcon, MailIcon } from "lucide-react"
import Link from "next/link"

import { BrandMark } from "@/components/brand-mark"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { LostPhoneButton } from "@/components/settings/lost-phone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useHydrated } from "@/hooks/use-hydrated"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useSessionStore } from "@/stores/session-store"

const STEPS = ["lost.step1", "lost.step2", "lost.step3", "lost.step4", "lost.step5", "lost.step6"] as const satisfies readonly MessageKey[]

/**
 * What to do, in order, when a phone is lost or broken: sign in elsewhere (which already signs the lost phone out), the
 * one-tap protection, then the bank, Telegram and the SIM — and the new phone gets everything back.
 */
export function LostView() {
  const t = useT()
  const hydrated = useHydrated()
  const signedIn = useSessionStore((s) => Boolean(s.user))
  return (
    <main className="app-frame mx-auto min-h-dvh w-full max-w-md space-y-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <BrandMark className="size-14" priority />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{t("lost.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("lost.lead")}</p>
        </div>
        <LanguageToggle compact />
      </div>

      <Card className="gap-3 px-4 py-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {STEPS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
      </Card>

      {hydrated && signedIn ? (
        <LostPhoneButton />
      ) : (
        <Button asChild className="h-12 w-full gap-2 rounded-xl text-base">
          <Link href="/login">
            <LogInIcon className="size-5" aria-hidden />
            {t("lost.signIn")}
          </Link>
        </Button>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <MailIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {t("lost.help")}{" "}
          <a className="font-medium text-primary underline-offset-2 hover:underline" href="mailto:support@luychlat.com">
            support@luychlat.com
          </a>
        </span>
      </p>
    </main>
  )
}
