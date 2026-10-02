"use client"

import { DeleteIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import type { BiometricKind } from "@/lib/security/biometric"
import { PIN_LENGTH } from "@/lib/security/pin"
import { cn } from "@/lib/utils"

import { BiometricIcon } from "./biometric-icon"

type PinPadProps = {
  title: string
  message?: string
  error?: boolean
  disabled?: boolean
  onComplete: (pin: string) => void
  /** Shows a biometric key in the bottom-left slot. */
  onBiometric?: () => void
  biometricLabel?: string
  /** Which icon the biometric key shows. */
  biometricKind?: BiometricKind
  /** Digits to collect: 6, or 4 to unlock with a not-yet-upgraded PIN. */
  length?: number
}

/** Numeric keypad with one dot per digit. Clears itself after each completed entry. */
export function PinPad({
  title,
  message,
  error,
  disabled,
  onComplete,
  onBiometric,
  biometricLabel,
  biometricKind = "any",
  length = PIN_LENGTH,
}: PinPadProps) {
  const [pin, setPinState] = useState("")
  const pinRef = useRef("")

  const setPin = (value: string) => {
    pinRef.current = value
    setPinState(value)
  }

  const press = useCallback(
    (digit: string) => {
      if (disabled || pinRef.current.length >= length) return
      const next = pinRef.current + digit
      setPin(next)
      if (next.length === length) {
        // Let the last dot render before handing off.
        setTimeout(() => {
          setPin("")
          onComplete(next)
        }, 120)
      }
    },
    [disabled, onComplete, length],
  )

  const backspace = useCallback(() => {
    if (pinRef.current.length < length) setPin(pinRef.current.slice(0, -1))
  }, [length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === "Backspace") backspace()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [press, backspace])

  const keyClass =
    "flex size-18 items-center justify-center rounded-full text-2xl font-medium transition-colors hover:bg-muted active:bg-muted/70 disabled:opacity-40"

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="space-y-2 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className={cn("min-h-5 text-sm", error ? "text-destructive" : "text-muted-foreground")} role="status">
          {message}
        </p>
      </div>

      <div className={cn("flex gap-3.5", error && "animate-shake")} aria-label={`${pin.length}/${length}`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border-2 border-primary transition-colors",
              i < pin.length && "bg-primary",
              error && "border-destructive",
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={keyClass} onClick={() => press(d)} disabled={disabled}>
            {d}
          </button>
        ))}
        {onBiometric ? (
          <button
            type="button"
            className={keyClass}
            onClick={onBiometric}
            disabled={disabled}
            aria-label={biometricLabel}
          >
            <BiometricIcon kind={biometricKind} className="size-7 text-primary" />
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={keyClass} onClick={() => press("0")} disabled={disabled}>
          0
        </button>
        <button type="button" className={keyClass} onClick={backspace} disabled={disabled} aria-label="Backspace">
          <DeleteIcon className="size-6" />
        </button>
      </div>
    </div>
  )
}
