"use client"

import { Loader2Icon, MoonStarIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { useSessionStore } from "@/stores/session-store"

/**
 * Islamic Lifestyle & Finance Mode (off by default; private to each user; free
 * on every plan). Off, the app shows no Islamic tabs, greetings or categories.
 */

/** New accounts are asked once, within this many days of signing up. */
const PROMPT_DAYS = 14

function useEnable() {
  const t = useT()
  const { setEnabled } = useIslamicMutations()
  const choose = (on: boolean) =>
    setEnabled.mutate(on, {
      onSuccess: () => on && toast.success(t("islamic.enabled")),
      onError: () => toast.error(t("common.error")),
    })
  return { choose, pending: setEnabled.isPending }
}

/** /islamic while the mode is off: what it includes and a one-tap Enable. */
export function IslamicModeOff() {
  const t = useT()
  const { choose, pending } = useEnable()
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

/**
 * Home, once: "Enable Islamic lifestyle features? [Enable] [Skip]" for accounts
 * younger than two weeks that never chose. Either answer is saved in the
 * database, so it doesn't come back on any device; Settings › Preferences
 * changes it later.
 */
export function IslamicModePrompt() {
  const t = useT()
  const createdAt = useSessionStore((s) => s.user?.created_at ?? null)
  const { settings, loaded } = useIslamicSettings()
  const { choose, pending } = useEnable()
  const isNew = createdAt ? Date.now() - new Date(createdAt).getTime() < PROMPT_DAYS * 86_400_000 : false
  if (!loaded || settings.decided || settings.enabled || !isNew) return null

  return (
    <Card className="gap-3 border-teal-500/30 bg-teal-500/5 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
          <MoonStarIcon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("islamic.promptTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("islamic.promptBody")}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => choose(false)} disabled={pending}>
          {t("islamic.skip")}
        </Button>
        <Button size="sm" className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => choose(true)} disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {t("islamic.enable")}
        </Button>
      </div>
    </Card>
  )
}
