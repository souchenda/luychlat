"use client"

import { DownloadIcon, ShareIcon, SquarePlusIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { INSTALL_BANNER_DELAY_MS, INSTALL_SNOOZE_KEY, installBannerMode, isIosUa } from "@/lib/install-banner"
import { isStandalone, useInstallPrompt } from "@/lib/install-prompt"
import { isNativeApp } from "@/lib/native-bridge"

const snoozedAt = () => {
  try {
    const v = Number(localStorage.getItem(INSTALL_SNOOZE_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/**
 * «ដំឡើងអេប លុយឆ្លាត» (founder, 3/11/2026): a floating card above the bottom bar, one [ដំឡើង] tap — the browser's own
 * install on Android / desktop, the two Share steps on an iPhone (lib/install-banner.ts). Never inside the Android app or
 * once installed; × hides it for 14 days on this phone.
 */
export function InstallBanner() {
  const t = useT()
  const prompt = useInstallPrompt()
  const [ready, setReady] = useState(false)
  const [closed, setClosed] = useState(false)
  const [env, setEnv] = useState<{ standalone: boolean; native: boolean; ios: boolean; snoozedAt: number | null } | null>(null)

  useEffect(() => {
    setEnv({ standalone: isStandalone(), native: isNativeApp(), ios: isIosUa(navigator.userAgent, navigator.maxTouchPoints > 1), snoozedAt: snoozedAt() })
    const timer = window.setTimeout(() => setReady(true), INSTALL_BANNER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const mode = env && !prompt.installed ? installBannerMode({ ...env, canPrompt: prompt.canPrompt, now: Date.now() }) : null
  if (!ready || closed || !mode) return null

  const close = () => {
    setClosed(true)
    try {
      localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now()))
    } catch {
      // Private window: hidden for this visit only.
    }
  }

  return (
    <div
      role="dialog"
      aria-label={t("install.bannerTitle")}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 mx-auto max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-300 md:bottom-6 md:left-auto md:right-6 md:mx-0 md:w-96 print:hidden"
    >
      <div className="flex items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-bold">{t("install.bannerTitle")}</p>
          {mode === "ios" ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("install.iosStep1")} <ShareIcon className="inline size-3.5 align-text-bottom" aria-label="Share" /> {t("install.iosStep2")}{" "}
              <SquarePlusIcon className="inline size-3.5 align-text-bottom" aria-hidden /> {t("install.iosStep3")}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">{t("install.bannerHint")}</p>
          )}
        </div>
        {mode === "prompt" && (
          <Button size="sm" className="shrink-0" onClick={() => void prompt.install()}>
            <DownloadIcon />
            {t("install.button")}
          </Button>
        )}
        <button type="button" onClick={close} aria-label={t("install.later")} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
