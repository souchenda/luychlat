"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Keeps the public pool page live: re-reads it every 30 s while the tab is visible. */
export function PoolAutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, 30_000)
    return () => clearInterval(id)
  }, [router])
  return null
}
