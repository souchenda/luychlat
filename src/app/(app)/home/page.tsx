"use client"

import {
  BotIcon,
  BriefcaseIcon,
  CloudOffIcon,
  FileBarChartIcon,
  HandCoinsIcon,
  ReceiptIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PinSetupDialog } from "@/components/lock/pin-setup-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

const ROADMAP: { phase: number; label: MessageKey; icon: typeof BotIcon }[] = [
  { phase: 2, label: "home.phase2", icon: BriefcaseIcon },
  { phase: 3, label: "home.phase3", icon: ReceiptIcon },
  { phase: 4, label: "home.phase4", icon: HandCoinsIcon },
  { phase: 5, label: "home.phase5", icon: BotIcon },
  { phase: 6, label: "home.phase6", icon: FileBarChartIcon },
]

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const { user, isGuest, endGuest } = useSessionStore()
  const hasPin = useLockStore((s) => Boolean(s.pinHash))
  const [pinOpen, setPinOpen] = useState(false)

  const identity = user?.phone ? `+${user.phone}` : (user?.email ?? null)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{t("home.greeting")}</h1>
        {identity && <p className="text-sm text-muted-foreground">{identity}</p>}
      </header>

      {isGuest && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudOffIcon className="size-5 text-amber-600" />
              {t("home.guestBanner")}
            </CardTitle>
            <CardDescription>{t("home.guestBannerHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() => {
                endGuest()
                router.replace("/login")
              }}
            >
              {t("home.createAccount")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasPin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-5 text-primary" />
              {t("home.secureTitle")}
            </CardTitle>
            <CardDescription>{t("home.secureHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => setPinOpen(true)}>
              {t("home.setPin")}
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("home.roadmapTitle")}</h2>
        <Card className="py-2">
          <ul className="divide-y">
            {ROADMAP.map(({ phase, label, icon: Icon }) => (
              <li key={phase} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-4.5" />
                </span>
                <span className="flex-1 text-sm">{t(label)}</span>
                <Badge variant="outline">{phase}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} />
    </div>
  )
}
