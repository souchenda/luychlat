"use client"

import { useSyncExternalStore } from "react"

/**
 * The browser's deferred install prompt, caught once for the whole app (founder, 3/11/2026). Chrome fires
 * «beforeinstallprompt» once, soon after the page loads — a listener mounted later (the Settings card) missed it. Caught
 * here at module load, shared by the install banner and the Settings card.
 */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    installed = true
    deferred = null
    emit()
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Opened from the home screen (Android / desktop) or added on an iPhone. */
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  const done = useSyncExternalStore(subscribe, () => installed, () => false)
  /** The browser's own install dialog; true when the person accepted. */
  const install = async () => {
    const e = deferred
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    deferred = null
    if (outcome === "accepted") installed = true
    emit()
    return outcome === "accepted"
  }
  return { canPrompt, installed: done, install }
}
