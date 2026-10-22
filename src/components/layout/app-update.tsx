"use client"

/**
 * «🚀 មានកំណែថ្មី v1.5!» (founder, 22/10/2026 — Task #468): in the Android app, at launch, the installed build (its
 * User-Agent token) is compared with GET /api/app/version; an older one gets a bottom sheet with the changes and
 * [ អាប់ដេតឥឡូវនេះ (Update) ] — no more APK files passed around on Telegram. Shown only when the file is really on the
 * server (a HEAD first), once a day per version at most («ពេលក្រោយ»).
 *
 * From build 6 the tap opens the file in the phone's browser (MainActivity's DownloadListener), which downloads it and
 * opens the package installer. An older APK cannot download from inside the app: the link is copied, to paste in Chrome.
 */
import { DownloadIcon, RocketIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { IN_APP_DOWNLOAD_FROM, installedApkCode, updateAvailable, updateSnoozed, UPDATE_SNOOZE_KEY, type AppVersionInfo } from "@/lib/apk-version"
import { useT } from "@/lib/i18n/use-t"
import { isNativeApp } from "@/lib/native-bridge"

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export function AppUpdatePrompt() {
  const t = useT()
  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [installed, setInstalled] = useState<number | null>(null)

  useEffect(() => {
    if (!isNativeApp()) return
    const code = installedApkCode(navigator.userAgent, true)
    setInstalled(code)
    let cancelled = false
    void (async () => {
      const res = await fetch("/api/app/version", { cache: "no-store" }).catch(() => null)
      const latest = (await res?.json().catch(() => null)) as AppVersionInfo | null
      if (!latest || !updateAvailable(code, latest.versionCode) || updateSnoozed(read(UPDATE_SNOOZE_KEY), latest.versionCode, Date.now())) return
      // Never offer a file that is not there yet (the APK is built after the web deploy).
      const file = await fetch(latest.downloadUrl, { method: "HEAD", cache: "no-store" }).catch(() => null)
      if (!cancelled && file?.ok) setInfo(latest)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!info) return null
  const url = new URL(info.downloadUrl, window.location.origin).toString()
  const later = () => {
    try {
      localStorage.setItem(UPDATE_SNOOZE_KEY, `${info.versionCode}:${Date.now()}`)
    } catch {
      // private mode: asked again next launch
    }
    setInfo(null)
  }
  const update = async () => {
    if ((installed ?? 0) >= IN_APP_DOWNLOAD_FROM) {
      window.location.href = url // the browser downloads it and opens the installer
      return
    }
    // An APK before 1.5 has no downloads of its own: the link for Chrome.
    const copied = await navigator.clipboard?.writeText(url).then(
      () => true,
      () => false,
    )
    toast(t(copied ? "appUpdate.copied" : "appUpdate.openInChrome"), { description: url, duration: 20_000 })
  }

  return (
    <BottomSheet open onOpenChange={(open) => !open && later()} title={t("appUpdate.title", { version: info.latestVersion })}>
      <div className="space-y-4">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <RocketIcon className="size-7" aria-hidden />
          </span>
        </div>
        <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm">{info.changelogKhmer}</p>
        <Button className="h-12 w-full gap-2 rounded-xl text-base" onClick={() => void update()}>
          <DownloadIcon className="size-5" aria-hidden />
          {t("appUpdate.update")}
        </Button>
        <Button variant="ghost" className="h-10 w-full" onClick={later}>
          {t("appUpdate.later")}
        </Button>
      </div>
    </BottomSheet>
  )
}
