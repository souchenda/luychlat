"use client"

import { useEffect, useRef } from "react"

import { installedApkCode } from "@/lib/apk-version"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { cleanErrorMessage, cleanPage, type DeviceInfo, deviceInfo, shouldReportError } from "@/lib/diagnostics"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { isNativeApp } from "@/lib/native-bridge"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? null

/** This phone and the app's settings on it, now (never a balance or a name). */
export function readDevice(extra: Pick<DeviceInfo, "lang" | "workspace" | "islamic">): DeviceInfo {
  return deviceInfo({
    ua: navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
    dark: document.documentElement.classList.contains("dark"),
    standalone: isNativeApp() || window.matchMedia?.("(display-mode: standalone)").matches === true,
    ...extra,
  })
}

/** The installed APK's build number, or null in a browser. */
export const apkCode = () => installedApkCode(navigator.userAgent, isNativeApp())

/**
 * Errors met on this phone go to the Control Center (founder, 28/10/2026) — cleaned (no amounts, phones or e-mails),
 * each message once per page, at most 10. On every page, signed in or not (mounted in the providers).
 */
export function ClientErrorReporter() {
  const sent = useRef(new Set<string>())
  useEffect(() => {
    const report = (raw: string) => {
      if (!shouldReportError(raw, sent.current)) return
      const message = cleanErrorMessage(raw)
      sent.current.add(message)
      const device = readDevice({ lang: document.documentElement.lang || "km", workspace: null, islamic: false })
      void getSupabaseBrowserClient()
        ?.rpc("log_client_error", { p_build: BUILD, p_page: cleanPage(location.pathname), p_message: message, p_device: device })
        .then(
          () => null,
          () => null,
        )
    }
    const onError = (e: ErrorEvent) => report(`${e.error?.name ?? "Error"}: ${e.message ?? ""}`)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | string | undefined
      report(typeof r === "string" ? r : `${r?.name ?? "Error"}: ${r?.message ?? ""}`)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}

/**
 * The version and phone of the signed-in person, once per opening of the app (and again when the workspace, the
 * language or Islamic Mode changes): Admin › Customers shows who runs an old version, on which phone.
 */
export function ClientReport() {
  const user = useSessionStore((s) => s.user)
  const { workspace } = useActiveWorkspace()
  const islamic = useIslamicEnabled()
  const lang = useLocaleStore((s) => s.locale)
  const type = workspace?.type ?? null
  useEffect(() => {
    if (!user || !type) return
    const id = window.setTimeout(() => {
      const device = readDevice({ lang, workspace: type, islamic })
      void getSupabaseBrowserClient()
        ?.rpc("report_client", { p_build: BUILD, p_apk: apkCode(), p_device: device })
        .then(
          () => null,
          () => null,
        )
    }, 3_000)
    return () => window.clearTimeout(id)
  }, [user, type, lang, islamic])
  return null
}
