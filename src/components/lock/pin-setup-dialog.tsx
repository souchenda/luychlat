"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/lib/i18n/use-t"
import { hashPin, isWeakPin, verifyPin } from "@/lib/security/pin"
import { useLockStore } from "@/stores/lock-store"

import { PinPad } from "./pin-pad"

type Step = "current" | "create" | "confirm"

type PinSetupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  /** Required move from a 4-digit to a 6-digit PIN right after unlocking: no "current PIN" step, can't be dismissed. */
  upgrade?: boolean
}

/** Create or change the App Lock PIN. Changing requires the current PIN first. */
export function PinSetupDialog({ open, onOpenChange, onSaved, upgrade }: PinSetupDialogProps) {
  const t = useT()
  const { pinHash, pinSalt, pinLength, setPin } = useLockStore()
  const [step, setStep] = useState<Step>(pinHash && !upgrade ? "current" : "create")
  const [firstPin, setFirstPin] = useState("")
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setStep(useLockStore.getState().pinHash && !upgrade ? "current" : "create")
    setFirstPin("")
    setMessage(undefined)
    setError(false)
  }

  const fail = (text: string, next: Step) => {
    setError(true)
    setMessage(text)
    setStep(next)
  }

  const onComplete = async (pin: string) => {
    if (step === "current") {
      setBusy(true)
      const ok = pinHash && pinSalt ? await verifyPin(pin, pinHash, pinSalt) : false
      setBusy(false)
      if (!ok) return fail(t("pin.wrongCurrent"), "current")
      setError(false)
      setMessage(undefined)
      setStep("create")
      return
    }
    if (step === "create") {
      if (isWeakPin(pin)) return fail(t("pin.weak"), "create")
      setError(false)
      setMessage(undefined)
      setFirstPin(pin)
      setStep("confirm")
      return
    }
    if (pin !== firstPin) {
      setFirstPin("")
      return fail(t("pin.mismatch"), "create")
    }
    setBusy(true)
    const { hash, salt } = await hashPin(pin)
    setBusy(false)
    setPin(hash, salt)
    toast.success(t("pin.saved"))
    onOpenChange(false)
    reset()
    onSaved?.()
  }

  const title =
    step === "current" ? t("pin.verifyCurrent") : step === "create" ? t("pin.createTitle") : t("pin.confirmTitle")
  // In upgrade mode, explain why until the user hits an error.
  const shown = message ?? (upgrade && step === "create" ? t("pin.upgradeHint") : undefined)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (upgrade && !next) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={!upgrade}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("settings.pin")}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <PinPad
            key={step}
            title={title}
            message={shown}
            error={error}
            disabled={busy}
            onComplete={onComplete}
            // The current PIN may still be an old 4-digit one.
            length={step === "current" ? pinLength : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
