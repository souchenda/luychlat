"use client"

import { CheckCircle2Icon, DownloadIcon, ShareIcon, SquarePlusIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { isIosUa } from "@/lib/install-banner"
import { isStandalone, useInstallPrompt } from "@/lib/install-prompt"

/** "Add to Home Screen": native prompt on Android/desktop Chrome, instructions on iOS Safari. */
export function InstallAppCard() {
  const t = useT()
  const prompt = useInstallPrompt()
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    setStandalone(isStandalone())
    setIos(isIosUa(navigator.userAgent))
  }, [])

  const installed = standalone || prompt.installed

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("install.title")}</h2>
      <Card className="flex-row items-center gap-3 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
        <img src="/icons/icon-192.png" alt="" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          {installed ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2Icon className="size-4" />
              {t("install.installed")}
            </p>
          ) : ios ? (
            <p className="text-xs text-muted-foreground">
              {t("install.iosStep1")} <ShareIcon className="inline size-3.5 align-text-bottom" /> {t("install.iosStep2")}{" "}
              <SquarePlusIcon className="inline size-3.5 align-text-bottom" /> {t("install.iosStep3")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t(prompt.canPrompt ? "install.hint" : "install.menuHint")}</p>
          )}
        </div>
        {!installed && prompt.canPrompt && (
          <Button size="sm" onClick={() => void prompt.install()}>
            <DownloadIcon />
            {t("install.button")}
          </Button>
        )}
      </Card>
    </section>
  )
}
