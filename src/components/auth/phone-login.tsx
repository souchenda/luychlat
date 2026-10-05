"use client"

import { ArrowLeftIcon, Loader2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { formatNationalNumber, isValidNationalNumber, KH_COUNTRY_CODE, toE164, toNationalNumber } from "@/lib/phone"
import { claimSingleSession } from "@/lib/auth/single-session"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const RESEND_SECONDS = 60
const OTP_LENGTH = 6

export function PhoneLogin({ disabled }: { disabled?: boolean }) {
  const t = useT()
  const [national, setNational] = useState("")
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const sendCode = async () => {
    if (!isValidNationalNumber(national)) return setError(t("login.invalidPhone"))
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setBusy(true)
    setError(undefined)
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(national) })
    setBusy(false)
    if (error) return setError(t("login.sendError"))
    setStep("otp")
    setOtp("")
    setResendIn(RESEND_SECONDS)
  }

  const verify = async (token: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || token.length !== OTP_LENGTH) return
    setBusy(true)
    setError(undefined)
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(national), token, type: "sms" })
    if (!error) await claimSingleSession(supabase)
    setBusy(false)
    // On success the AuthListener picks up the session and the login page redirects.
    if (error) {
      setError(t("login.otpError"))
      setOtp("")
    }
  }

  if (step === "otp") {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            setStep("phone")
            setError(undefined)
          }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {t("login.changeNumber")}
        </button>
        <div className="space-y-1">
          <p className="font-semibold">{t("login.otpTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("login.otpSentTo", { phone: `${KH_COUNTRY_CODE} ${formatNationalNumber(national)}` })}
          </p>
        </div>
        <InputOTP
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={setOtp}
          onComplete={verify}
          disabled={busy}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          containerClassName="justify-center"
        >
          <InputOTPGroup>
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Button className="h-12 w-full text-base" onClick={() => verify(otp)} disabled={busy || otp.length !== OTP_LENGTH}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("login.verify")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={sendCode} disabled={busy || resendIn > 0}>
          {resendIn > 0 ? t("login.resendIn", { seconds: resendIn }) : t("login.resend")}
        </Button>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void sendCode()
      }}
    >
      <Label htmlFor="phone">{t("login.phoneLabel")}</Label>
      <div className="flex h-12 items-center rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <span className="flex h-full items-center gap-1.5 border-r px-3 text-sm font-medium">
          <span aria-hidden>🇰🇭</span>
          {KH_COUNTRY_CODE}
        </span>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="12 345 678"
          value={formatNationalNumber(national)}
          onChange={(e) => {
            setNational(toNationalNumber(e.target.value))
            setError(undefined)
          }}
          disabled={disabled || busy}
          aria-invalid={Boolean(error)}
          className="h-full border-0 bg-transparent text-base tracking-wide shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={disabled || busy || national.length < 8}>
        {busy && <Loader2Icon className="animate-spin" />}
        {t("login.sendCode")}
      </Button>
    </form>
  )
}
