"use client"

import { useEffect } from "react"

import { CHUNK_RELOADED_KEY, STALE_RELOADED_KEY, shouldReloadForBuild, shouldReloadForChunk } from "@/lib/stale-build"

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
    // A missing code chunk (this page still runs the previous build and the update removed its files): reload once onto
    // the live build instead of a blank «Application error» (founder, 28/10/2026).
    const onChunkError = (message: string | undefined) => {
      let reloadedFor: string | null = null
      try {
        reloadedFor = sessionStorage.getItem(CHUNK_RELOADED_KEY)
      } catch {
        // no storage: the reload below still happens once in this page's life
      }
      if (!shouldReloadForChunk({ message, running: RUNNING, pathname: location.pathname, reloadedFor })) return
      try {
        sessionStorage.setItem(CHUNK_RELOADED_KEY, RUNNING ?? "unknown")
      } catch {
        // ignored
      }
      location.reload()
    }
    const onError = (e: ErrorEvent) => onChunkError(`${e.error?.name ?? ""} ${e.message ?? ""}`)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | string | undefined
      onChunkError(typeof r === "string" ? r : `${r?.name ?? ""} ${r?.message ?? ""}`)
    }
    document.addEventListener("visibilitychange", onChange)
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      document.removeEventListener("visibilitychange", onChange)
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}
