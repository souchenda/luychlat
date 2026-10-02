"use client"

import { Loader2Icon, ShieldAlertIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { create } from "zustand"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { PinPad } from "@/components/lock/pin-pad"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { useMfaState, verifyCode } from "@/lib/mfa"
import { biometricKind, verifyBiometric } from "@/lib/security/biometric"
import { verifyPin } from "@/lib/security/pin"
import { useLockStore } from "@/stores/lock-store"

import { CodeInput } from "./code-input"

/**
 * "Confirm it's you" before a risky action (deleting a business, wallet,
 * asset…, resetting data, turning security off). Uses what the person has set
 * up, strongest first: Face ID / fingerprint, the app PIN, the 2FA code, or a
 * plain confirmation when none is set.
 *
 *   if (!(await stepUp(t("stepUp.deleteWallet", { name })))) return
 */
type Request = { reason: string; resolve: (ok: boolean) => void }
const useStepUpStore = create<{ request: Request | null; set: (r: Request | null) => void }>()((set) => ({
  request: null,
  set: (request) => set({ request }),
}))

export function stepUp(reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = useStepUpStore.getState().request
    prev?.resolve(false)
    useStepUpStore.getState().set({ reason, resolve })
  })
}

const MAX_TRIES = 5

/** Mounted once in the app layout. */
export function StepUpDialog() {
  const t = useT()
  const request = useStepUpStore((s) => s.request)
  const setRequest = useStepUpStore((s) => s.set)
  const { pinHash, pinSalt, pinLength, biometricCredentialId, biometricPreference } = useLockStore()
  const factorId = useMfaState().data?.factorId ?? null
  const mode = pinHash ? "pin" : factorId ? "code" : "confirm"
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState("")
  const tries = useRef(0)
  const prompted = useRef(false)

  const finish = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
    setError(false)
    setCode("")
    tries.current = 0
    prompted.current = false
  }
  const fail = () => {
    tries.current += 1
    setError(true)
    if (tries.current >= MAX_TRIES) finish(false)
  }

  const biometric = async () => {
    if (!biometricCredentialId) return
    setBusy(true)
    const result = await verifyBiometric(biometricCredentialId)
    setBusy(false)
    if (result === "ok") finish(true)
  }

  // Face ID / fingerprint straight away when it's set up.
  useEffect(() => {
    if (request && mode === "pin" && biometricCredentialId && !prompted.current) {
      prompted.current = true
      void biometric()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request
  }, [request])

  const checkPin = async (pin: string) => {
    if (!pinHash || !pinSalt) return
    setBusy(true)
    const ok = await verifyPin(pin, pinHash, pinSalt)
    setBusy(false)
    if (ok) finish(true)
    else fail()
  }
  const checkCode = async (value: string) => {
    if (!factorId) return
    setBusy(true)
    const ok = await verifyCode(factorId, value)
    setBusy(false)
    if (ok) finish(true)
    else {
      setCode("")
      fail()
    }
  }

  return (
    <BottomSheet open={request !== null} onOpenChange={(open) => !open && finish(false)} title={t("stepUp.title")} description={request?.reason}>
      <div className="space-y-4">
        {mode === "pin" ? (
          <PinPad
            title={t("stepUp.enterPin")}
            message={error ? t("stepUp.wrong", { left: MAX_TRIES - tries.current }) : undefined}
            error={error}
            disabled={busy}
            length={pinLength ?? 6}
            onComplete={checkPin}
            onBiometric={biometricCredentialId ? biometric : undefined}
            biometricKind={biometricKind(biometricPreference)}
            biometricLabel={t("stepUp.useBiometric")}
          />
        ) : mode === "code" ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">{t("stepUp.enterCode")}</p>
            <CodeInput value={code} onChange={setCode} onComplete={checkCode} disabled={busy} />
            {error && <p className="text-sm text-destructive">{t("mfa.wrongCode")}</p>}
            {busy && <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("stepUp.noLock")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => finish(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => finish(true)}>
                {t("stepUp.confirm")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
