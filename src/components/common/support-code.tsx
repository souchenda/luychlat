"use client"

import { CopyIcon, FingerprintIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { apkCode, readDevice } from "@/components/common/client-diagnostics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { apkVersion } from "@/lib/apk-version"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { type DeviceInfo, buildLabel, deviceLine, supportCode, supportText } from "@/lib/diagnostics"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? null

/**
 * The support code (founder, 28/10/2026 — «I read 6, they read 9»): a short code to read out on the phone or in a chat,
 * with this phone's version and setup — support finds the person by it (Admin › Customers) and sees what they see.
 * Never a balance, an amount or a name; one tap copies it.
 */
export function SupportCodeCard() {
  const t = useT()
  const user = useSessionStore((s) => s.user)
  const { workspace } = useActiveWorkspace()
  const islamic = useIslamicEnabled()
  const lang = useLocaleStore((s) => s.locale)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [apk, setApk] = useState<string | null>(null)
  useEffect(() => {
    setDevice(readDevice({ lang, workspace: workspace?.type ?? null, islamic }))
    const v = apkVersion(apkCode())
    setApk(v.kind === "known" ? `${v.version ?? "?"} (${v.code})` : v.kind === "old" ? "≤ 1.4" : null)
  }, [lang, workspace?.type, islamic])
  const code = supportCode(user?.id)
  if (!code || !device) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(supportText({ code, build: BUILD, apk, device }))
      toast.success(t("support.code.copied"))
    } catch {
      toast.error(t("common.error"))
    }
  }
  return (
    <Card className="gap-2 px-4 py-4">
      <div className="flex items-center gap-2">
        <FingerprintIcon className="size-5 text-primary" aria-hidden />
        <p className="flex-1 text-sm font-medium">{t("support.code.title")}</p>
        <span className="rounded-lg bg-muted px-2 py-1 font-mono text-sm font-semibold tracking-wider">{code}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("support.code.hint")}</p>
      <p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-[11px] leading-relaxed break-words text-muted-foreground">
        Build {buildLabel(BUILD)}
        {apk ? ` · APK ${apk}` : ""}
        <br />
        {deviceLine(device)}
      </p>
      <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={copy}>
        <CopyIcon className="size-4" aria-hidden />
        {t("support.code.copy")}
      </Button>
    </Card>
  )
}
