"use client"

import { BotIcon, CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon, WalletIcon, ZapIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { markOnboardingSeen, seenInProfile, seenOnDevice, useOnboardingStore } from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

const STEPS = [
  { icon: WalletIcon, key: "wallet" },
  { icon: ZapIcon, key: "record" },
  { icon: CalendarCheckIcon, key: "loans" },
  { icon: BotIcon, key: "bot" },
] as const

/** Accounts newer than this see the guide by itself (older ones only from Settings). */
const NEW_ACCOUNT_DAYS = 14

/**
 * Welcome guide: 4 steps (wallets, 3-second entries, loans & bills, the
 * Telegram bot) with dots, Back / Next, swipe on phones and "Skip" on every
 * step. Opens by itself once for a new account; never again once seen.
 */
export function WelcomeGuide() {
  const t = useT()
  const user = useSessionStore((s) => s.user)
  const { open, show, hide } = useOnboardingStore()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const touchX = useRef<number | null>(null)

  // First visit of a new account: open once, unless seen here or on another device.
  useEffect(() => {
    if (!user || seenOnDevice()) return
    const age = Date.now() - Date.parse(user.created_at ?? "")
    if (!(age < NEW_ACCOUNT_DAYS * 86_400_000)) return
    let cancelled = false
    void seenInProfile(user.id).then((seen) => {
      if (cancelled) return
      if (seen) markOnboardingSeen(undefined)
      else show()
    })
    return () => {
      cancelled = true
    }
  }, [user, show])

  // Each opening starts at step 1.
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  if (!open) return null
  const last = step === STEPS.length - 1
  const close = () => {
    hide()
    void markOnboardingSeen(user?.id)
  }
  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length) return
    setDir(to > step ? 1 : -1)
    setStep(to)
  }
  const { icon: Icon, key } = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm animate-in fade-in-0 duration-200 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("onboarding.title")}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl animate-in slide-in-from-bottom-6 duration-300 sm:rounded-3xl dark:bg-neutral-900"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1))
        }}
      >
        {/* Soft emerald glow behind the icon. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-emerald-100/80 to-transparent dark:from-emerald-500/15" />
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 z-10 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          {t("onboarding.skip")}
        </button>

        <div
          key={step}
          className={cn("relative flex flex-col items-center px-7 pt-12 text-center animate-in fade-in-0 duration-300", dir === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6")}
        >
          <span className="flex size-20 items-center justify-center rounded-3xl bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30">
            <Icon className="size-10" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="mt-6 text-xl leading-snug font-semibold">{t(`onboarding.${key}.title` as MessageKey)}</h2>
          <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t(`onboarding.${key}.body` as MessageKey)}</p>
        </div>

        {/* ● ○ ○ ○ — tap a dot to jump there. */}
        <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label={t("onboarding.title")}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={t("onboarding.stepOf", { n: i + 1, total: STEPS.length })}
              onClick={() => go(i)}
              className={cn("h-2 rounded-full transition-all duration-300", i === step ? "w-6 bg-emerald-600" : "w-2 bg-neutral-300 dark:bg-neutral-700")}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 px-6">
          <Button
            type="button"
            variant="ghost"
            className={cn("h-12 rounded-xl px-4", step === 0 && "invisible")}
            onClick={() => go(step - 1)}
            aria-label={t("onboarding.back")}
          >
            <ChevronLeftIcon />
            {t("onboarding.back")}
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.98]"
            onClick={() => (last ? close() : go(step + 1))}
          >
            {last ? t("onboarding.start") : t("onboarding.next")}
            {!last && <ChevronRightIcon />}
          </Button>
        </div>
      </div>
    </div>
  )
}
