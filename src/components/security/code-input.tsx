"use client"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export const CODE_LENGTH = 6

/** 6-digit authenticator code; calls onComplete when all digits are in. */
export function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (code: string) => void; disabled?: boolean }) {
  return (
    <InputOTP
      maxLength={CODE_LENGTH}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
