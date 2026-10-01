"use client"

import { useEffect } from "react"

import { useRepo } from "@/lib/data/hooks"
import { ensureDailySnapshot } from "@/lib/data/snapshots"

/**
 * Guest Mode "time machine": on the first app open of each day (and when the
 * app returns to the foreground on a new day), saves the data as it stood at
 * the end of the previous day, before anything changes today.
 */
export function SnapshotScheduler() {
  const { scope } = useRepo()

  useEffect(() => {
    if (scope !== "guest") return
    void ensureDailySnapshot()
    const onVisible = () => {
      if (document.visibilityState === "visible") void ensureDailySnapshot()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [scope])

  return null
}
