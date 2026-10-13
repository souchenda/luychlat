"use client"

import { useEffect } from "react"

import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Privacy by default (founder, 13/10/2026): the moment the app leaves the screen — the phone locks, the
 * person switches apps, the tab is hidden or the page is put away — balances are masked again, so
 * coming back always shows `*****` until the eye is tapped. (They also start hidden on every launch:
 * the setting is never saved — stores/prefs-store.ts.)
 */
export function BalancePrivacyGuard() {
  const setHideBalances = usePrefsStore((s) => s.setHideBalances)
  useEffect(() => {
    const hide = () => setHideBalances(true)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", hide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", hide)
    }
  }, [setHideBalances])
  return null
}
