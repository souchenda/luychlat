"use client"

import { BellRingIcon, BookOpenTextIcon, BriefcaseIcon, CheckIcon, CoinsIcon, CompassIcon, Loader2Icon, MapPinIcon, MoonStarIcon, SunriseIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

/**
 * Islamic Lifestyle & Finance Mode (off by default; private to each user; free
 * on every plan). Off, the app shows no Islamic tabs, greetings or categories.
 * Discovery: a link on the login screen, a one-time experience choice on first
 * login, and the toggle in Settings › Preferences.
 */

/** New accounts are asked once, within this many days of signing up. */
const PROMPT_DAYS = 14

const FEATURES: { icon: typeof SunriseIcon; title: MessageKey; hint: MessageKey }[] = [
  { icon: SunriseIcon, title: "islamic.featPrayer", hint: "islamic.featPrayerHint" },
  { icon: BellRingIcon, title: "islamic.featAdhan", hint: "islamic.featAdhanHint" },
  { icon: BookOpenTextIcon, title: "islamic.featQuran", hint: "islamic.featQuranHint" },
  { icon: CoinsIcon, title: "islamic.featZakat", hint: "islamic.featZakatHint" },
  { icon: CompassIcon, title: "islamic.featQibla", hint: "islamic.featQiblaHint" },
  { icon: MapPinIcon, title: "islamic.featHalal", hint: "islamic.featHalalHint" },
]

function useChoose() {
  const t = useT()
  const { setEnabled } = useIslamicMutations()
  const choose = (on: boolean, done?: () => void) =>
    setEnabled.mutate(on, {
      onSuccess: () => {
        if (on) toast.success(t("islamic.enabled"))
        done?.()
      },
      onError: () => toast.error(t("common.error")),
    })
  return { choose, pending: setEnabled.isPending, choosing: setEnabled.variables }
}

/** /islamic while the mode is off: what it includes and a one-tap Enable. */
export function IslamicModeOff() {
  const t = useT()
  const { choose, pending } = useChoose()
  return (
    <Card className="items-center gap-3 px-6 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
        <MoonStarIcon className="size-6" aria-hidden />
      </span>
      <p className="font-semibold">{t("islamic.mode")}</p>
      <p className="text-sm text-muted-foreground">{t("islamic.offBody")}</p>
      <Button className="mt-1 min-w-32" onClick={() => choose(true)} disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {t("islamic.enable")}
      </Button>
    </Card>
  )
}

/** Login screen: "🕌 សាសនិកឥស្លាម? មើលមុខងារពិសេស" and a sheet with the highlights. Nothing is turned on here. */
export function IslamicDiscoveryLink() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-teal-500/10"
      >
        <span aria-hidden>🕌</span>
        {t("islamic.discoverAsk")}
        <span className="font-semibold text-teal-700 dark:text-teal-400">{t("islamic.discoverLink")}</span>
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={t("islamic.mode")} description={t("islamic.discoverIntro")}>
        <ul className="space-y-3">
          {FEATURES.map(({ icon: Icon, title, hint }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(title)}</span>
                <span className="block text-xs text-muted-foreground">{t(hint)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t("islamic.discoverNote")}</p>
        <Button className="mt-4 h-11 w-full" onClick={() => setOpen(false)}>
          {t("islamic.discoverOk")}
        </Button>
      </BottomSheet>
    </>
  )
}

/**
 * First login: choose the experience — General Finance or Islamic Finance &
 * Lifestyle — in one tap. Shown once to accounts younger than two weeks that
 * never chose; the answer is saved in the database (no return on any device)
 * and can be changed in Settings › Preferences. "Later" only hides it for now.
 */
export function ExperienceSelector() {
  const t = useT()
  const createdAt = useSessionStore((s) => s.user?.created_at ?? null)
  const { settings, loaded } = useIslamicSettings()
  const { choose, pending, choosing } = useChoose()
  const [later, setLater] = useState(false)
  const [done, setDone] = useState(false)
  const isNew = createdAt ? Date.now() - new Date(createdAt).getTime() < PROMPT_DAYS * 86_400_000 : false
  const open = loaded && isNew && !settings.decided && !settings.enabled && !later && !done

  const option = (islamic: boolean) => {
    const busy = pending && choosing === islamic
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => choose(islamic, () => setDone(true))}
        className={cn(
          "group relative flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99] disabled:opacity-70",
          islamic ? "border-teal-500/30 hover:border-teal-500 hover:bg-teal-500/5" : "border-border hover:border-primary hover:bg-primary/5",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl text-xl",
            islamic ? "bg-teal-500/15" : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          {islamic ? "🕌" : <BriefcaseIcon className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t(islamic ? "islamic.choiceIslamic" : "islamic.choiceGeneral")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t(islamic ? "islamic.choiceIslamicHint" : "islamic.choiceGeneralHint")}</span>
        </span>
        {busy ? (
          <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <CheckIcon className="size-5 shrink-0 text-transparent group-hover:text-muted-foreground" aria-hidden />
        )}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setLater(true)}>
      <DialogContent showCloseButton={false} className="gap-4 rounded-3xl p-5">
        <div className="space-y-1 text-center">
          <DialogTitle className="text-lg">{t("islamic.choiceTitle")}</DialogTitle>
          <DialogDescription>{t("islamic.choiceSubtitle")}</DialogDescription>
        </div>
        <div className="space-y-3">
          {option(false)}
          {option(true)}
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("islamic.choiceNote")}</p>
        <button type="button" className="mx-auto text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setLater(true)}>
          {t("islamic.choiceLater")}
        </button>
      </DialogContent>
    </Dialog>
  )
}
