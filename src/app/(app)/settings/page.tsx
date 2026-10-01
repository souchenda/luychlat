"use client"

import { CoinsIcon, FingerprintIcon, KeyRoundIcon, LockIcon, LogOutIcon, TimerIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PinSetupDialog } from "@/components/lock/pin-setup-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { BIOMETRIC_MOCK, isBiometricAvailable, registerBiometric } from "@/lib/security/biometric"
import { AUTO_LOCK_OPTIONS, type AutoLockMinutes, useLockStore } from "@/stores/lock-store"
import { parseAmount } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

function Row({ icon, title, hint, children }: { icon?: React.ReactNode; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {icon && <span className="text-muted-foreground [&_svg]:size-5">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <Card className="gap-0 divide-y py-0">{children}</Card>
    </section>
  )
}

function ExchangeRateRow() {
  const t = useT()
  const { khrPerUsd, setKhrPerUsd } = usePrefsStore()
  const [value, setValue] = useState(String(khrPerUsd))
  const parsed = parseAmount(value)
  const valid = parsed >= 1000 && parsed <= 10000

  const save = () => {
    if (!valid) return
    setKhrPerUsd(Math.round(parsed))
    toast.success(t("settings.rateSaved"))
  }

  return (
    <Row icon={<CoinsIcon />} title={t("settings.exchangeRate")} hint={t("settings.exchangeRateHint")}>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <span className="text-xs text-muted-foreground">$1 =</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          className="h-8 w-20 text-right tabular-nums"
          aria-label={t("settings.exchangeRate")}
          aria-invalid={!valid}
        />
        <span className="text-xs text-muted-foreground">៛</span>
        {valid && Math.round(parsed) !== khrPerUsd && (
          <Button type="submit" size="sm">
            {t("common.save")}
          </Button>
        )}
      </form>
    </Row>
  )
}

export default function SettingsPage() {
  const t = useT()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocaleStore()
  const { user, isGuest } = useSessionStore()
  const { pinHash, biometricCredentialId, autoLockMinutes, setBiometricCredential, setAutoLock, clearSecurity, lock } =
    useLockStore()
  const [pinOpen, setPinOpen] = useState(false)
  const [biometricSupported, setBiometricSupported] = useState(false)

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricSupported)
  }, [])

  const toggleBiometric = async (enabled: boolean) => {
    if (!enabled) return setBiometricCredential(null)
    const id = await registerBiometric()
    if (!id) return toast.error(t("lock.biometricFailed"))
    setBiometricCredential(id)
    toast.success(t("settings.biometricEnabled"))
  }

  const removePin = () => {
    clearSecurity()
    toast.success(t("settings.pinRemoved"))
  }

  const signOut = async () => {
    if (!window.confirm(t("settings.signOutConfirm"))) return
    await signOutEverywhere()
    router.replace("/login")
  }

  const biometricHint = !biometricSupported
    ? t("settings.biometricUnsupported")
    : BIOMETRIC_MOCK
      ? t("settings.biometricMock")
      : t("settings.biometricHint")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <Section title={t("settings.security")}>
        <Row
          icon={<KeyRoundIcon />}
          title={t("settings.pin")}
          hint={pinHash ? t("settings.pinOn") : t("settings.pinOff")}
        >
          <Button size="sm" variant="outline" onClick={() => setPinOpen(true)}>
            {pinHash ? t("settings.changePin") : t("settings.setPin")}
          </Button>
        </Row>
        <Row icon={<FingerprintIcon />} title={t("settings.biometric")} hint={biometricHint}>
          <Switch
            checked={Boolean(biometricCredentialId)}
            onCheckedChange={toggleBiometric}
            disabled={!pinHash || !biometricSupported}
            aria-label={t("settings.biometric")}
          />
        </Row>
        <Row icon={<TimerIcon />} title={t("settings.autoLock")} hint={t("settings.autoLockHint")}>
          <Select
            value={String(autoLockMinutes)}
            onValueChange={(v) => setAutoLock(Number(v) as AutoLockMinutes)}
            disabled={!pinHash}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_LOCK_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {t(`settings.autoLock.${m}` as MessageKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {pinHash && (
          <div className="flex gap-2 px-4 py-3">
            <Button size="sm" variant="secondary" onClick={lock}>
              <LockIcon />
              {t("settings.lockNow")}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removePin}>
              {t("settings.removePin")}
            </Button>
          </div>
        )}
      </Section>

      <Section title={t("settings.money")}>
        <ExchangeRateRow />
      </Section>

      <Section title={t("settings.appearance")}>
        <Row title={t("settings.language")}>
          <Select value={locale} onValueChange={(v) => setLocale(v as "km" | "en")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">ខ្មែរ</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title={t("settings.theme")}>
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["light", "dark", "system"] as const).map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`settings.theme.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title={t("settings.account")}>
        <Row title={isGuest ? t("settings.guestAccount") : (user?.phone ? `+${user.phone}` : (user?.email ?? ""))} />
        <div className="px-4 py-3">
          <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
            <LogOutIcon />
            {isGuest ? t("settings.endGuest") : t("settings.signOut")}
          </Button>
        </div>
      </Section>

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} />
    </div>
  )
}
