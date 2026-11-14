"use client"

import { useReportWebVitals } from "next/web-vitals"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { deviceOf, normalizeRoute, VITALS, type VitalName } from "@/lib/web-vitals"

type Pending = { metric: VitalName; value: number; route: string; device: string }

/**
 * Mounted once in the app layout (founder, 14/11/2026): each screen's Web Vitals go to /api/vitals in one small batch
 * when the page is hidden or left (sendBeacon, so a closing app still sends) — the route without ids and the device
 * kind only (src/lib/web-vitals.ts). Never blocks or slows a screen.
 */
export function WebVitalsReporter() {
  const pathname = usePathname()
  const route = useRef(pathname)
  route.current = pathname
  const queue = useRef<Pending[]>([])

  useReportWebVitals((m) => {
    const metric = VITALS.find((v) => v === m.name)
    if (!metric) return
    queue.current.push({ metric, value: m.value, route: normalizeRoute(route.current ?? "/"), device: deviceOf(navigator.userAgent) })
  })

  useEffect(() => {
    const flush = () => {
      const vitals = queue.current.splice(0, 5)
      if (!vitals.length) return
      const body = JSON.stringify({ vitals })
      const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }))
      if (!sent) void fetch("/api/vitals", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => null)
    }
    const onHide = () => document.visibilityState === "hidden" && flush()
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flush)
    }
  }, [])

  // A new screen: what the last one measured goes out (single-page navigation never hides the page).
  useEffect(() => {
    const vitals = queue.current.splice(0, 5)
    if (!vitals.length) return
    void fetch("/api/vitals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vitals }), keepalive: true }).catch(() => null)
  }, [pathname])

  return null
}
