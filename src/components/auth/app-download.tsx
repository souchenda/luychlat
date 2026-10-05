"use client"

import { DownloadIcon, ShareIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { useT } from "@/lib/i18n/use-t"
import { isNativeApp } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

const APK_URL = "/LuyChlat.apk"

type Device = "android" | "ios" | "other"

/** The Android robot head (vector, so it looks the same on every phone). */
function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
    </svg>
  )
}

/**
 * Login page: get the Android app (the APK built on the server). Prominent on
 * Android phones, a quiet link on computers, an "Add to Home Screen" hint on
 * iPhone (no APK there), and nothing inside the app itself.
 */
export function AppDownload() {
  const t = useT()
  const [device, setDevice] = useState<Device | null>(null)
  const [size, setSize] = useState("3.2 MB")

  useEffect(() => {
    if (isNativeApp()) return
    const ua = navigator.userAgent
    // iPadOS reports a Mac: a Mac with a touch screen is an iPad.
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    setDevice(/Android/i.test(ua) ? "android" : ios ? "ios" : "other")
    if (ios) return
    // The real size of the file that's up now.
    fetch(APK_URL, { method: "HEAD", cache: "no-store" })
      .then((res) => {
        const bytes = Number(res.headers.get("content-length"))
        if (res.ok && bytes > 0) setSize(`${(bytes / 1024 / 1024).toFixed(1)} MB`)
        else if (!res.ok) setDevice(null) // no APK published yet
      })
      .catch(() => {})
  }, [])

  if (!device) return null

  if (device === "ios") {
    return (
      <p className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        <ShareIcon className="size-3.5 shrink-0" aria-hidden />
        {t("app.iosHint")}
      </p>
    )
  }

  const android = device === "android"
  return (
    <a
      href={APK_URL}
      download="LuyChlat.apk"
      className={cn(
        "mx-auto mt-5 flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
        android
          ? "h-12 w-full border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
          : "h-10 px-3 text-neutral-500 hover:text-emerald-700 dark:text-neutral-400 dark:hover:text-emerald-400",
      )}
    >
      <AndroidIcon className={cn("shrink-0 text-[#3DDC84]", android ? "size-5" : "size-4")} />
      {t("app.downloadApk", { size })}
      {android && <DownloadIcon className="size-4 shrink-0 opacity-70" aria-hidden />}
    </a>
  )
}
