"use client"

import { KeyRoundIcon, LockIcon, RectangleEllipsisIcon, TimerIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BiometricIcon } from "@/components/lock/biometric-icon"
import { PinSetupDialog } from "@/components/lock/pin-setup-dialog"
import { stepUp } from "@/components/security/step-up"
import { TwoFactorRow } from "@/components/security/two-factor"
import { ActiveDevices } from "@/components/settings/active-devices"
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import {
  BIOMETRIC_MOCK,
  biometricKind,
  isBiometricAvailable,
  registerBiometric,
  type BiometricKind,
  type BiometricPreference,
} from "@/lib/security/biometric"
import { AUTO_LOCK_OPTIONS, type AutoLockMinutes, useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

/** Settings › Security: app lock (PIN, Face ID, auto-lock), password, 2FA and devices. */
export function SecuritySettings() {
  const t = useT()
  const router = useRouter()
  const email = useSessionStore((s) => s.user?.email ?? null)
  const {
    pinHash,
    biometricCredentialId,
    biometricPreference,
    autoLockMinutes,
    setBiometricCredential,
    setBiometricPreference,
    setAutoLock,
    clearSecurity,
    lock,
  } = useLockStore()
  const [bioKind, setBioKind] = useState<BiometricKind>("any")
  useEffect(() => setBioKind(biometricKind(biometricPreference)), [biometricPreference])
  const [pinOpen, setPinOpen] = useState(false)
  const [biometricSupported, setBiometricSupported] = useState(false)

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricSupported)
  }, [])

  const toggleBiometric = async (enabled: boolean) => {
    // Turning a security feature off needs the PIN (or Face ID) first.
    if (!enabled) {
      if (await stepUp(t("stepUp.biometricOff"))) setBiometricCredential(null)
      return
    }
    const id = await registerBiometric()
    if (!id) return toast.error(t("lock.biometricFailed"))
    setBiometricCredential(id)
    toast.success(t("settings.biometricEnabled"))
  }

  const removePin = async () => {
    if (!(await stepUp(t("stepUp.pinOff")))) return
    clearSecurity()
    toast.success(t("settings.pinRemoved"))
  }

  const biometricHint = !biometricSupported
    ? t("settings.biometricUnsupported")
    : BIOMETRIC_MOCK
      ? t("settings.biometricMock")
      : t("settings.biometricHint")

  return (
    <>
      <SettingsGroup title={t("settings.appLock")}>
        <SettingsRow icon={<KeyRoundIcon />} tile="emerald" title={t("settings.pin")} hint={pinHash ? t("settings.pinOn") : t("settings.pinOff")}>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              // Changing an existing PIN needs the current one (or Face ID) first.
              if (pinHash && !(await stepUp(t("stepUp.pinChange")))) return
              setPinOpen(true)
            }}
          >
            {pinHash ? t("settings.changePin") : t("settings.setPin")}
          </Button>
        </SettingsRow>
        <SettingsRow icon={<BiometricIcon kind={bioKind} className="size-5" />} tile="sky" title={t(`settings.biometric.${bioKind}`)} hint={biometricHint}>
          <Switch
            checked={Boolean(biometricCredentialId)}
            onCheckedChange={toggleBiometric}
            disabled={!pinHash || !biometricSupported}
            aria-label={t(`settings.biometric.${bioKind}`)}
          />
        </SettingsRow>
        {biometricCredentialId && (
          <SettingsRow title={t("settings.biometricShowAs")} hint={t("settings.biometricShowAsHint")}>
            <Select value={biometricPreference} onValueChange={(v) => setBiometricPreference(v as BiometricPreference)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["auto", "face", "fingerprint"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`settings.biometricPref.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        )}
        <SettingsRow icon={<TimerIcon />} tile="amber" title={t("settings.autoLock")} hint={t("settings.autoLockHint")}>
          <Select value={String(autoLockMinutes)} onValueChange={(v) => setAutoLock(Number(v) as AutoLockMinutes)} disabled={!pinHash}>
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
        </SettingsRow>
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
      </SettingsGroup>

      <SettingsGroup title={t("settings.signInSecurity")}>
        {email && (
          <SettingsRow
            icon={<RectangleEllipsisIcon />}
            tile="violet"
            title={t("settings.changePassword")}
            hint={email}
            onClick={async () => {
              // Setting a new password needs the PIN (or Face ID) first, like other sensitive changes.
              if (!(await stepUp(t("settings.changePassword")))) return
              router.push("/reset-password")
            }}
          />
        )}
        <TwoFactorRow />
        <ActiveDevices />
      </SettingsGroup>

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} />
    </>
  )
}
