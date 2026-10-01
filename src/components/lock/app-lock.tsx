"use client"

import { LockKeyholeIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useT } from "@/lib/i18n/use-t"
import { verifyBiometric } from "@/lib/security/biometric"
import { verifyPin } from "@/lib/security/pin"
import { MAX_PIN_ATTEMPTS, useLockStore } from "@/stores/lock-store"

import { PinPad } from "./pin-pad"

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const

/** Locks the app after inactivity or after it was in the background too long. */
function useAutoLock() {
  const pinHash = useLockStore((s) => s.pinHash)
  const isLocked = useLockStore((s) => s.isLocked)
  const autoLockMinutes = useLockStore((s) => s.autoLockMinutes)
  const lock = useLockStore((s) => s.lock)

  useEffect(() => {
    if (!pinHash || isLocked) return
    const timeoutMs = autoLockMinutes * 60_000
    let lastActivity = Date.now()
    let hiddenAt: number | null = null

    const onActivity = () => {
      lastActivity = Date.now()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        if (timeoutMs === 0) lock()
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= timeoutMs) {
        lock()
      }
    }
    const interval = timeoutMs > 0 ? setInterval(() => Date.now() - lastActivity >= timeoutMs && lock(), 5_000) : undefined

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener("visibilitychange", onVisibility)
      clearInterval(interval)
    }
  }, [pinHash, isLocked, autoLockMinutes, lock])
}

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

export function AppLock() {
  useAutoLock()
  const t = useT()
  const router = useRouter()
  const { isLocked, pinHash, pinSalt, biometricCredentialId, failedAttempts, lockoutUntil, unlock, registerFailure } =
    useLockStore()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const secondsLeft = useCountdown(lockoutUntil)
  const lockedOut = secondsLeft > 0
  const autoPrompted = useRef(false)

  const tryBiometric = useCallback(async () => {
    if (!biometricCredentialId) return
    if (await verifyBiometric(biometricCredentialId)) unlock()
    else {
      setError(true)
      setMessage(t("lock.biometricFailed"))
    }
  }, [biometricCredentialId, unlock, t])

  // Offer biometrics once each time the lock screen appears.
  useEffect(() => {
    if (!isLocked) {
      autoPrompted.current = false
      return
    }
    if (biometricCredentialId && !autoPrompted.current && !lockedOut) {
      autoPrompted.current = true
      void tryBiometric()
    }
  }, [isLocked, biometricCredentialId, lockedOut, tryBiometric])

  const onPin = useCallback(
    async (pin: string) => {
      if (!pinHash || !pinSalt || lockedOut) return
      setChecking(true)
      const ok = await verifyPin(pin, pinHash, pinSalt)
      setChecking(false)
      if (ok) {
        setError(false)
        setMessage(undefined)
        unlock()
        return
      }
      registerFailure()
      setError(true)
      const left = MAX_PIN_ATTEMPTS - (failedAttempts + 1)
      setMessage(left > 0 ? t("lock.wrongPin", { left }) : undefined)
    },
    [pinHash, pinSalt, lockedOut, unlock, registerFailure, failedAttempts, t],
  )

  const onForgot = async () => {
    if (!window.confirm(t("lock.forgotPinConfirm"))) return
    await signOutEverywhere()
    router.replace("/login")
  }

  if (!isLocked || !pinHash) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LockKeyholeIcon className="size-7" />
        </div>
        <p className="text-sm text-muted-foreground">{t("lock.title")}</p>
      </div>
      <PinPad
        title={t("lock.enterPin")}
        message={lockedOut ? t("lock.lockedOut", { seconds: secondsLeft }) : message}
        error={error || lockedOut}
        disabled={lockedOut || checking}
        onComplete={onPin}
        onBiometric={biometricCredentialId ? tryBiometric : undefined}
        biometricLabel={t("lock.useBiometric")}
      />
      <Button variant="link" className="text-muted-foreground" onClick={onForgot}>
        {t("lock.forgotPin")}
      </Button>
    </div>
  )
}
