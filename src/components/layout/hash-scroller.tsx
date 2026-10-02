"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

/**
 * Scrolls to "#section" after navigating to a page whose section renders late
 * (e.g. /settings#referral once the referral card has loaded). Gives up after ~3 s.
 */
export function HashScroller() {
  const pathname = usePathname()
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    let tries = 0
    const timer = window.setInterval(() => {
      const el = document.getElementById(id)
      if (el || ++tries > 30) {
        window.clearInterval(timer)
        el?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [pathname])
  return null
}
