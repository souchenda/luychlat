"use client"

import { useEffect } from "react"

import { STALE_RELOADED_KEY, shouldReloadForBuild } from "@/lib/stale-build"

/** The build this page runs (next.config.ts sets it once per build; the server's /api/health answers the same). */
const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID ?? null

/**
 * Task #526: back on screen after a deploy, the app reloads once onto the live build — an app left in the background
 * never keeps old code running (an old prayer scheduler planned the Adhan with Islamic Mode off). Mounted in the app layout.
 */
export function StaleBuildReload() {
  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        return
      }
      const hiddenMs = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      void fetch("/api/health", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ build?: string }>) : null))
        .then((h) => {
          let reloadedFor: string | null = null
          try {
            reloadedFor = sessionStorage.getItem(STALE_RELOADED_KEY)
          } catch {
            // no storage: shouldReloadForBuild still reloads at most once per build in this page's life
          }
          if (!shouldReloadForBuild({ running: RUNNING, deployed: h?.build, hiddenMs, pathname: location.pathname, reloadedFor })) return
          try {
            sessionStorage.setItem(STALE_RELOADED_KEY, h!.build!)
          } catch {
            // ignored
          }
          location.reload()
        })
        .catch(() => null)
    }
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])
  return null
}
