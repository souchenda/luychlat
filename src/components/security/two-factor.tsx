"use client"

import { CopyIcon, Loader2Icon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { disableMfa, startEnrollment, useMfaState, useRefreshMfa, verifyCode } from "@/lib/mfa"
import { cn } from "@/lib/utils"

import { CodeInput } from "./code-input"

type Setup = { factorId: string; qr: string; secret: string }

/** Settings › Security: turn two-factor sign-in (authenticator app) on or off. */
export function TwoFactorRow() {
  const t = useT()
  const { data, isLoading } = useMfaState()
  const refresh = useRefreshMfa()
  const on = Boolean(data?.factorId)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const begin = async () => {
    setBusy(true)
    try {
      setSetup(await startEnrollment())
      setCode("")
      setError(false)
    } catch {
      toast.error(t("mfa.unavailable"))
    } finally {
      setBusy(false)
    }
  }

  const confirmSetup = async (value: string) => {
    if (!setup) return
    setBusy(true)
    const ok = await verifyCode(setup.factorId, value)
    setBusy(false)
    if (!ok) {
      setError(true)
      setCode("")
      return
    }
    setSetup(null)
    await refresh()
    toast.success(t("mfa.enabled"))
  }

  // Turning 2FA off always needs a current code (and Supabase requires it too).
  const confirmDisable = async (value: string) => {
    if (!data?.factorId) return
    setBusy(true)
    const ok = await verifyCode(data.factorId, value)
    if (ok) {
      try {
        await disableMfa(data.factorId)
        setDisabling(false)
        await refresh()
        toast.success(t("mfa.disabled"))
      } catch {
        toast.error(t("common.error"))
      }
    } else {
      setError(true)
      setCode("")
    }
    setBusy(false)
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={cn("[&_svg]:size-5", on ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{on ? <ShieldCheckIcon /> : <ShieldOffIcon />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("mfa.title")}</p>
          <p className="text-xs text-muted-foreground">{isLoading ? "…" : t(on ? "mfa.on" : "mfa.off")}</p>
        </div>
        <Button
          size="sm"
          variant={on ? "outline" : "default"}
          disabled={isLoading || busy}
          onClick={() => {
            if (on) {
              setCode("")
              setError(false)
              setDisabling(true)
            } else void begin()
          }}
        >
          {busy && !setup && !disabling && <Loader2Icon className="animate-spin" />}
          {t(on ? "mfa.turnOff" : "mfa.turnOn")}
        </Button>
      </div>

      <BottomSheet open={setup !== null} onOpenChange={(open) => !open && setSetup(null)} title={t("mfa.setupTitle")} description={t("mfa.setupHint")}>
        {setup && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("mfa.step1")}</li>
              <li>{t("mfa.step2")}</li>
              <li>{t("mfa.step3")}</li>
            </ol>
            <div className="mx-auto w-52 rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URL from Supabase */}
              <img src={setup.qr} alt={t("mfa.qrAlt")} className="aspect-square w-full" />
            </div>
            <button
              type="button"
              className="mx-auto flex max-w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2 font-mono text-xs break-all"
              onClick={() => void navigator.clipboard?.writeText(setup.secret).then(() => toast.success(t("family.codeCopied")))}
              aria-label={t("mfa.copySecret")}
            >
              {setup.secret}
              <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            <CodeInput value={code} onChange={setCode} onComplete={confirmSetup} disabled={busy} />
            {error && <p className="text-center text-sm text-destructive">{t("mfa.wrongCode")}</p>}
            <Button className="h-12 w-full text-base" onClick={() => confirmSetup(code)} disabled={busy || code.length !== 6}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t("mfa.activate")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("mfa.backupTip")}</p>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={disabling} onOpenChange={setDisabling} title={t("mfa.turnOffTitle")} description={t("mfa.turnOffHint")}>
        <div className="space-y-4">
          <CodeInput value={code} onChange={setCode} onComplete={confirmDisable} disabled={busy} />
          {error && <p className="text-center text-sm text-destructive">{t("mfa.wrongCode")}</p>}
          <Button variant="destructive" className="h-12 w-full text-base" onClick={() => confirmDisable(code)} disabled={busy || code.length !== 6}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("mfa.turnOff")}
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
