"use client"

/**
 * The PIN before the balances show (founder, 23/10/2026 — Task #477, lib/security/balance-reveal.ts): the eye asks
 * (prefs-store › revealRequest), this sheet takes the App Lock PIN on the keypad, a wrong one shakes and clears, five in
 * a row wait 30 s. Revealed balances mask again after 60 s without a touch while the lock is on.
 */
import { useEffect, useRef, useState } from "react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { PinPad } from "@/components/lock/pin-pad"
import { useT } from "@/lib/i18n/use-t"
import { NO_FAILURES, readRevealState, REVEAL_IDLE_MS, REVEAL_STATE_KEY, revealFailure, revealTriesLeft, revealWaitSeconds, type RevealState } from "@/lib/security/balance-reveal"
import { verifyPin } from "@/lib/security/pin"
import { useLockStore } from "@/stores/lock-store"
import { usePrefsStore } from "@/stores/prefs-store"

const load = (): RevealState => {
  try {
    return readRevealState(localStorage.getItem(REVEAL_STATE_KEY))
  } catch {
    return NO_FAILURES
  }
}
const save = (s: RevealState) => {
  try {
    localStorage.setItem(REVEAL_STATE_KEY, JSON.stringify(s))
  } catch {
    // private mode: counted in memory only
  }
}

export function BalanceRevealGate() {
  const t = useT()
  const request = usePrefsStore((s) => s.revealRequest)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const lockOn = usePrefsStore((s) => s.balancePinLock)
  const setHideBalances = usePrefsStore((s) => s.setHideBalances)
  const { pinHash, pinSalt, pinLength } = useLockStore()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  // A request saved from an earlier visit never opens the sheet: only a new tap of the eye.
  const seen = useRef(request)

  useEffect(() => {
    if (request === seen.current) return
    seen.current = request
    setError(false)
    setMessage(undefined)
    setOpen(true)
  }, [request])

  // The countdown while a wait is on.
  const wait = revealWaitSeconds(open ? load() : NO_FAILURES, Date.now())
  useEffect(() => {
    if (!open || !wait) return
    const id = window.setInterval(() => tick((n) => n + 1), 1_000)
    return () => window.clearInterval(id)
  }, [open, wait])

  // Revealed with the lock on: masked again after 60 s without a touch.
  useEffect(() => {
    if (hidden || !lockOn) return
    let timer = window.setTimeout(() => setHideBalances(true), REVEAL_IDLE_MS)
    const touched = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setHideBalances(true), REVEAL_IDLE_MS)
    }
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, touched, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, touched))
    }
  }, [hidden, lockOn, setHideBalances])

  const check = async (pin: string) => {
    if (!pinHash || !pinSalt) return setOpen(false)
    if (revealWaitSeconds(load(), Date.now())) return
    setBusy(true)
    const ok = await verifyPin(pin, pinHash, pinSalt).catch(() => false)
    setBusy(false)
    if (ok) {
      save(NO_FAILURES)
      setHideBalances(false)
      return setOpen(false)
    }
    const next = revealFailure(load(), Date.now())
    save(next)
    setError(true)
    setMessage(next.until ? t("balancePin.wait", { seconds: revealWaitSeconds(next, Date.now()) }) : t("balancePin.wrong", { count: revealTriesLeft(next) }))
  }

  return (
    <BottomSheet open={open} onOpenChange={setOpen} title={t("balancePin.title")}>
      <PinPad
        title={t("balancePin.title")}
        message={wait ? t("balancePin.wait", { seconds: wait }) : message}
        error={error || Boolean(wait)}
        disabled={busy || Boolean(wait)}
        length={pinLength}
        onComplete={(pin) => void check(pin)}
      />
    </BottomSheet>
  )
}
