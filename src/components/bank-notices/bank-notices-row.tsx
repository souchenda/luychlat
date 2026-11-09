"use client"

import { BellRingIcon, CheckCircle2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { BankNotices, UNREAD_KEY } from "@/components/bank-notices/bank-notices-sync"
import { SettingsRow, StatusBadge } from "@/components/settings/settings-ui"
import type { BankNotice } from "@/lib/bank-notices"
import { useT } from "@/lib/i18n/use-t"
import { isNativeApp } from "@/lib/native-bridge"

/**
 * Settings › «កត់ត្រាពីការជូនដំណឹងធនាគារ» (founder, 9/11/2026): in the Android app (1.15+) the status and one tap to
 * Android's «Notification access» — the person turns it on or off there, the app cannot. The notices it could not read
 * stay on this phone and are listed here (the bank's own words, so the reader can learn them); nothing is guessed.
 * Hidden in a browser, on an iPhone and in older apps.
 */
export function BankNoticesRow() {
  const t = useT()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [unread, setUnread] = useState<BankNotice[]>([])
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) return
    const check = () => {
      BankNotices.status()
        .then((s) => setEnabled(s.enabled))
        .catch(() => setEnabled(null))
      try {
        setUnread(JSON.parse(localStorage.getItem(UNREAD_KEY) ?? "[]") as BankNotice[])
      } catch {
        setUnread([])
      }
    }
    check()
    // Back from Android's settings: checked again.
    document.addEventListener("visibilitychange", check)
    return () => document.removeEventListener("visibilitychange", check)
  }, [])

  if (enabled === null) return null

  return (
    <>
      <SettingsRow
        icon={<BellRingIcon />}
        tile="emerald"
        title={t("bankNotice.title")}
        hint={t(enabled ? "bankNotice.hintOn" : "bankNotice.hintOff")}
        onClick={() => void BankNotices.openSettings().catch(() => undefined)}
      >
        {enabled ? (
          <StatusBadge tone="success">
            <CheckCircle2Icon aria-hidden />
            {t("bankNotice.on")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="info">{t("bankNotice.turnOn")}</StatusBadge>
        )}
      </SettingsRow>
      {unread.length > 0 && (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          <button type="button" className="min-h-11 underline underline-offset-2" onClick={() => setShow((s) => !s)}>
            {t("bankNotice.unread", { n: unread.length })}
          </button>
          {show && (
            <ul className="mt-1 space-y-1.5">
              {unread.slice(-10).reverse().map((n, i) => (
                <li key={`${n.time}-${i}`} className="rounded-lg bg-muted px-2.5 py-1.5 break-words">
                  <span className="block font-medium text-foreground">{n.title}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
