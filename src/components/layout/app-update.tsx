"use client"

/**
 * «🚀 មានកំណែថ្មី v1.7!» (founder, 22/10/2026 — Task #468): in the Android app, at launch, the installed build (its
 * User-Agent token) is compared with GET /api/app/version; an older one gets a bottom sheet with the changes and
 * [ អាប់ដេតឥឡូវនេះ (Update) ] — no more APK files passed around on Telegram. Shown only when the file is really on the
 * server (a HEAD first), once a day per version at most («ពេលក្រោយ»).
 *
 * How the tap updates (lib/apk-version.ts › updatePath):
 * - 1.7+ (Task #478): downloaded inside the app — «កំពុងទាញយកកំណែថ្មី v1.7... (XX%)» — then Android's own installer, its
 *   one «Install» confirmation. «Install unknown apps» is explained and opened once when Android hasn't allowed it.
 * - 1.5 / 1.6: the link opens in the phone's browser (MainActivity's DownloadListener), which downloads and installs.
 * - Older: the link is copied, to paste in Chrome.
 */
import { DownloadIcon, RocketIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { installedApkCode, updateAvailable, updatePath, updateSnoozed, UPDATE_SNOOZE_KEY, type AppVersionInfo } from "@/lib/apk-version"
import { useT } from "@/lib/i18n/use-t"
import { isNativeApp } from "@/lib/native-bridge"
import { canInstallUpdates, downloadAndInstall, openInstallSettings } from "@/lib/native-updater"

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

type Stage = "offer" | "permission" | "downloading" | "installing" | "failed"

export function AppUpdatePrompt() {
  const t = useT()
  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [installed, setInstalled] = useState<number | null>(null)
  const [stage, setStage] = useState<Stage>("offer")
  const [percent, setPercent] = useState(0)

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

  // Back from Android's «Install unknown apps» page: allowed now → the download starts by itself.
  useEffect(() => {
    if (stage !== "permission") return
    const back = () => {
      if (document.visibilityState !== "visible") return
      void canInstallUpdates().then((ok) => ok && void start())
    }
    document.addEventListener("visibilitychange", back)
    return () => document.removeEventListener("visibilitychange", back)
  })

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

  async function start() {
    setStage("downloading")
    setPercent(0)
    try {
      await downloadAndInstall(url, (p) => setPercent(p))
      setStage("installing") // Android's installer is on screen
    } catch {
      setStage("failed")
    }
  }

  const update = async () => {
    const path = updatePath(installed)
    if (path === "in-app") {
      const allowed = await canInstallUpdates().catch(() => false)
      return allowed ? start() : setStage("permission")
    }
    if (path === "browser") {
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

  const busy = stage === "downloading" || stage === "installing"
  return (
    <BottomSheet open onOpenChange={(open) => !open && !busy && later()} title={t("appUpdate.title", { version: info.latestVersion })}>
      <div className="space-y-4">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            {stage === "permission" ? <ShieldCheckIcon className="size-7" aria-hidden /> : <RocketIcon className="size-7" aria-hidden />}
          </span>
        </div>

        {stage === "permission" ? (
          <>
            <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">{t("appUpdate.permission")}</p>
            <Button className="h-12 w-full rounded-xl text-base" onClick={() => void openInstallSettings().catch(() => null)}>
              {t("appUpdate.openSettings")}
            </Button>
          </>
        ) : stage === "downloading" || stage === "installing" ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-center text-sm font-medium">
              {stage === "installing" ? t("appUpdate.installing") : t("appUpdate.downloading", { version: info.latestVersion, percent: percent >= 0 ? `${percent}%` : "…" })}
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${stage === "installing" ? 100 : Math.max(0, percent)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm">{info.changelogKhmer}</p>
            {stage === "failed" && <p className="text-center text-sm text-destructive">{t("appUpdate.failed")}</p>}
            <Button className="h-12 w-full gap-2 rounded-xl text-base" onClick={() => void update()}>
              <DownloadIcon className="size-5" aria-hidden />
              {t("appUpdate.update")}
            </Button>
          </>
        )}
        {!busy && (
          <Button variant="ghost" className="h-10 w-full" onClick={later}>
            {t("appUpdate.later")}
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}
